import "dotenv/config";
import { MongoClient } from "mongodb";

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseSize(label) {
  const normalized = String(label || "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  if (/(^|\D)10\s*(inch|in|")\b/.test(normalized) || /(^|\s)(xxl|2xl)(\s|$|-)/.test(normalized)) return "xxl";
  if (/(^|\D)8\s*(inch|in|")\b/.test(normalized) || /(^|\s)xl(\s|$|-)/.test(normalized)) return "xl";
  if (/(^|\D)6\s*(inch|in|")\b/.test(normalized) || /(^|\s)l(\s|$|-)/.test(normalized)) return "l";
  if (/(^|\D)4\s*(inch|in|")\b/.test(normalized) || /(^|\s)m(\s|$|-)/.test(normalized)) return "m";
  if (/(^|\D)3\s*(inch|in|")\b/.test(normalized) || /(^|\s)s(\s|$|-)/.test(normalized)) return "s";
  return "";
}

function designIdFromLineItem(lineItem) {
  const wanted = new Set(["_design id", "design id", "reference id"]);
  const attribute = (lineItem.customAttributes || []).find((item) =>
    wanted.has(String(item.key || "").trim().toLowerCase())
  );
  return String(attribute?.value || "").trim();
}

function orderNumberFromGid(gid) {
  return String(gid || "").split("/").pop() || "";
}

async function shopifyGraphql(query, variables) {
  const store = requiredEnv("SHOPIFY_STORE_DOMAIN").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const response = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": requiredEnv("SHOPIFY_ADMIN_ACCESS_TOKEN")
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errors?.length) {
    throw new Error(data.errors?.map((error) => error.message).join("; ") || `Shopify request failed (${response.status})`);
  }
  return data.data;
}

const query = `
  query BackfillOrderSizes($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        name
        lineItems(first: 100) {
          nodes {
            variantTitle
            customAttributes { key value }
          }
        }
      }
    }
  }
`;

const confirmed = process.argv.includes("--confirm");
const client = new MongoClient(requiredEnv("MONGODB_URI"));

try {
  await client.connect();
  const collection = client.db(process.env.MONGODB_DB_NAME || "stamptrial").collection("designs");
  const designs = await collection.find(
    { orderId: { $exists: true, $nin: [null, ""] } },
    { projection: { designId: 1, orderId: 1, orderName: 1, "settings.selectedSize": 1 } }
  ).toArray();

  const byOrderId = new Map();
  for (const design of designs) {
    const orderId = String(design.orderId || "").replace(/\D/g, "");
    if (!orderId) continue;
    if (!byOrderId.has(orderId)) byOrderId.set(orderId, []);
    byOrderId.get(orderId).push(design);
  }

  const orderIds = [...byOrderId.keys()];
  const corrections = [];
  let inaccessibleOrders = 0;
  for (let start = 0; start < orderIds.length; start += 25) {
    const batch = orderIds.slice(start, start + 25);
    const data = await shopifyGraphql(query, {
      ids: batch.map((id) => `gid://shopify/Order/${id}`)
    });

    for (const order of data.nodes || []) {
      if (!order) {
        inaccessibleOrders++;
        continue;
      }
      const orderId = orderNumberFromGid(order.id);
      const records = byOrderId.get(orderId) || [];
      const lineItems = order.lineItems?.nodes || [];
      const matchedDesignIds = new Set();

      for (const lineItem of lineItems) {
        const designId = designIdFromLineItem(lineItem);
        const size = parseSize(lineItem.variantTitle);
        if (!designId || !size) continue;
        const record = records.find((item) => item.designId === designId);
        if (!record) continue;
        matchedDesignIds.add(designId);
        if (record.settings?.selectedSize !== size) {
          corrections.push({ record, size, label: lineItem.variantTitle, orderName: order.name });
        }
      }

      if (records.length === 1 && !matchedDesignIds.has(records[0].designId)) {
        const sizedItems = lineItems
          .map((item) => ({ item, size: parseSize(item.variantTitle) }))
          .filter(({ size }) => size);
        if (sizedItems.length === 1 && records[0].settings?.selectedSize !== sizedItems[0].size) {
          corrections.push({
            record: records[0],
            size: sizedItems[0].size,
            label: sizedItems[0].item.variantTitle,
            orderName: order.name
          });
        }
      }
    }
    console.log(`Checked ${Math.min(start + 25, orderIds.length)} of ${orderIds.length} Shopify orders...`);
  }

  console.log(`\nFound ${corrections.length} size correction(s).`);
  for (const item of corrections) {
    console.log(`${item.orderName || item.record.orderName || item.record.orderId}  ${item.record.designId}: ${item.record.settings?.selectedSize || "missing"} -> ${item.size} (${item.label})`);
  }
  if (inaccessibleOrders) {
    console.warn(`${inaccessibleOrders} order(s) were unavailable. Orders older than 60 days can require read_all_orders.`);
  }

  if (!confirmed) {
    console.log("\nDry run only. Run again with --confirm to update MongoDB.");
    process.exitCode = corrections.length ? 2 : 0;
  } else if (corrections.length) {
    const result = await collection.bulkWrite(corrections.map((item) => ({
      updateOne: {
        filter: { _id: item.record._id },
        update: {
          $set: {
            "settings.selectedSize": item.size,
            "settings.selectedSizeLabel": item.label,
            sizeBackfilledAt: new Date()
          }
        }
      }
    })), { ordered: false });
    console.log(`Updated ${result.modifiedCount} MongoDB record(s).`);
  }
} finally {
  await client.close();
}
