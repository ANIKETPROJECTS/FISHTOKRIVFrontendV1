import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

let ordersConnection: mongoose.Connection | null = null;

const orderCouponSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, default: null },
    code: { type: String, default: null },
    discountType: { type: String, default: null },
    discountValue: { type: Number, default: null },
    discountAmount: { type: Number, default: null },
  },
  { _id: false }
);

const deliveryAddressDetailSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, default: null },
    phone: { type: String, default: null },
    building: { type: String, default: null },
    street: { type: String, default: null },
    area: { type: String, default: null },
    pincode: { type: String, default: null },
    type: { type: String, default: "house" },
    label: { type: String, default: "Home" },
    instructions: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema({
  orderId: { type: String, default: null },
  customerId: { type: String, default: null },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: null },
  deliveryArea: { type: String, required: true },
  address: { type: String, required: true },
  deliveryAddressDetail: { type: deliveryAddressDetailSchema, default: null },
  pickupLocation: { type: String, default: "" },
  items: { type: mongoose.Schema.Types.Mixed, required: true },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  slotCharge: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, default: "pending" },
  notes: { type: String, default: "" },
  source: { type: String, default: "online" },
  deliveryType: { type: String, default: "delivery" },
  scheduleType: { type: String, default: null },
  timeslotId: { type: String, default: null },
  timeslotLabel: { type: String, default: null },
  timeslotStart: { type: String, default: null },
  timeslotEnd: { type: String, default: null },
  deliveryDate: { type: String, default: null },
  couponIds: { type: [String], default: [] },
  couponCodes: { type: [String], default: [] },
  coupons: { type: mongoose.Schema.Types.Mixed, default: [] },
  paymentMode: { type: String, default: null },
  paymentStatus: { type: String, default: "unpaid" },
  payments: { type: mongoose.Schema.Types.Mixed, default: [] },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  superHubId: { type: String, default: null },
  superHubName: { type: String, default: null },
  subHubId: { type: String, default: null },
  subHubName: { type: String, default: null },
  inventoryDeducted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export async function connectOrdersDb() {
  if (!ordersConnection) {
    ordersConnection = mongoose.createConnection(MONGODB_URI, { dbName: "orders" });
    ordersConnection.on("connected", () => console.log("Connected to orders DB"));
    ordersConnection.on("error", (err) => console.error("Orders DB error:", err));
    await ordersConnection.asPromise();
  }
  return ordersConnection;
}

export function getOrderModel() {
  if (!ordersConnection) {
    throw new Error("Orders DB not connected. Call connectOrdersDb() first.");
  }
  return ordersConnection.models["Order"] || ordersConnection.model("Order", orderSchema);
}
