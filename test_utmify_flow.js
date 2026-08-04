import { sendOrderToUtmify } from './services/utmify.js';

async function runTest() {
  console.log("=== SIMULANDO CRIAÇÃO DE PIX ===");
  const orderData1 = {
    orderId: "DS-123456-ABCDEF",
    paymentId: "100001",
    transactionAmount: 67.90,
    status: "pending",
    paymentMethod: "pix",
    customer: {
      name: "João da Silva",
      email: "joao@email.com",
      phone: "11999999999",
      document: "12345678909"
    }
  };
  const trackingParams = { utm_source: "facebook", utm_campaign: "C1" };
  
  await sendOrderToUtmify(orderData1, trackingParams, "192.168.0.1");

  console.log("\n=== SIMULANDO WEBHOOK (PIX APROVADO) ===");
  const orderData2 = {
    ...orderData1,
    status: "approved"
  };
  await sendOrderToUtmify(orderData2, trackingParams, "");
}

runTest();
