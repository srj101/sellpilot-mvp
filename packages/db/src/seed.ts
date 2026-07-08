import { eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  user,
  product,
  productVariant,
  customer,
  order,
  orderItem,
  offer,
  businessProfile,
  shippingRate,
  faq,
  policy,
} from "./schema";

const ADJECTIVES = [
  "Premium", "Eco-Friendly", "Classic", "Modern", "Wireless",
  "Ultra-Slim", "Waterproof", "Ergonomic", "Smart", "Luxury",
  "Handcrafted", "Vintage", "Breathable", "Compact", "Durable",
  "Sleek", "Portable", "Lightweight", "Sturdy", "Stylish"
];

const CATEGORIES = {
  Electronics: [
    "Smart Phone", "Laptop", "Noise-Cancelling Headphones", "Fast Charger",
    "Bluetooth Speaker", "Smart Watch", "Power Bank", "Gaming Mouse",
    "Mechanical Keyboard", "USB-C Hub", "Wireless Earbuds", "Tablet Stand",
    "Screen Protector", "LED Ring Light", "Webcam 1080p"
  ],
  Fashion: [
    "Cotton T-Shirt", "Slim-Fit Jeans", "Pullover Hoodie", "Running Shoes",
    "Leather Wallet", "Canvas Backpack", "Wool Socks", "Designer Sunglasses",
    "Sports Cap", "Denim Jacket", "Chino Pants", "Winter Scarf",
    "Leather Belt", "Casual Blazer", "Duffel Bag"
  ],
  "Home Decor": [
    "Minimalist Desk Lamp", "Velvet Cushion Cover", "Scented Soy Candle",
    "Ceramic Flower Vase", "Bohemian Throw Blanket", "Wall Art Frame",
    "Succulent Planter Set", "Woven Storage Basket", "Coffee Table Tray",
    "Copper Water Pitcher", "Diffuser", "Silk Pillowcase",
    "Macrame Wall Hanging", "Desk Organizer", "Doormat"
  ],
  Fitness: [
    "Non-Slip Yoga Mat", "Adjustable Dumbbells", "Insulated Water Bottle",
    "Resistance Bands", "Speed Jump Rope", "Fitness Tracker Band",
    "Waterproof Gym Bag", "High-Density Foam Roller", "Protein Shaker",
    "Running Waist Belt", "Push-Up Bars", "Core Sliders",
    "Gym Chalk Bag", "Yoga Block Set", "Ankle Weights"
  ]
};

const DISTRICTS = [
  "Dhaka", "Chittagong", "Sylhet", "Khulna", "Rajshahi", "Barisal", "Rangpur", "Mymensingh"
];

const CUSTOMER_NAMES = [
  "Abir Rahman", "Sadia Islam", "Tamim Iqbal", "Fariha Ahmed", "Nabil Chowdhury",
  "Nusrat Jahan", "Imran Khan", "Ayesha Siddiqua", "Rashedul Hasan", "Mariya Sultana",
  "Farhan Karim", "Tasnim Rahman", "Arifur Rahman", "Sabrina Yesmin", "Mahbub Alam",
  "Jannatul Ferdous", "Sabbir Hossain", "Nabila Tabassum", "Zahid Hasan", "Samia Khan",
  "Kazi Harun", "Munira Begum", "Shafiqul Islam", "Rozina Akter", "Kamrul Hasan",
  "Shirin Sultana", "Asif Ahmed", "Rina Paul", "Sujit Das", "Anika Tahsin",
  "Adnan Sami", "Mehzabin Chowdhury", "Rafsan Shabab", "Ishrat Jahan", "Monir Hossain",
  "Rehana Parveen", "Sohag Hossain", "Tania Sultana", "Jamil Ahmed", "Fatema Khatun",
  "Emon Hasan", "Mitu Akter", "Riaz Uddin", "Farhana Yasmin", "Nazmul Huda",
  "Laila Arzumand", "Biplob Kumar", "Shahnaz Parveen", "Javed Karim", "Ruma Ghosh"
];

const FAQ_ITEMS = [
  { q: "What is your return policy?", a: "We offer a 7-day hassle-free return policy. Products must be unused and in original packaging." },
  { q: "How long does shipping take?", a: "Shipping takes 1-2 days within Dhaka, and 3-5 days outside Dhaka." },
  { q: "What payment methods do you accept?", a: "We accept Cash on Delivery (COD), bKash, Nagad, and credit/debit cards." },
  { q: "Do you offer warranty on electronics?", a: "Yes, all our electronic items come with a 6-month replacement warranty." },
  { q: "How can I track my order?", a: "Once your order is shipped, we will send you a tracking number and link via SMS." },
  { q: "Can I change my shipping address after ordering?", a: "Please contact our support within 2 hours of ordering to update your delivery address." },
  { q: "Are your fashion items true to size?", a: "Yes, please refer to the size chart on each product page for exact measurements." },
  { q: "Do you ship internationally?", a: "Currently, we only ship within Bangladesh." },
  { q: "What happens if I receive a damaged product?", a: "Please contact support immediately with an unboxing video. We will exchange it for free." },
  { q: "Is Cash on Delivery available everywhere?", a: "Yes, COD is available in all 64 districts of Bangladesh." }
];

async function main() {
  console.log("=== STARTING SEEDER SCRIPT ===");

  try {
    // 1. Fetch or create users
    let users = await db.select().from(user);
    if (users.length === 0) {
      console.log("No users found. Creating dummy users...");
      const dummyUsers = [
        { id: "8ZXwynCeZJGmhhLIqx0LrbbHoN1Ik7sy", name: "Instagram Shop Owner", email: "shop@instagram.com" },
        { id: "merchant_1", name: "Premium Merchant", email: "merchant1@sellpilot.com" },
      ];
      users = await db.insert(user).values(dummyUsers).returning();
      console.log(`Created ${users.length} dummy users.`);
    } else {
      // Ensure the test user exists
      const testUserId = "8ZXwynCeZJGmhhLIqx0LrbbHoN1Ik7sy";
      const hasInstagramUser = users.some(u => u.id === testUserId);
      if (!hasInstagramUser) {
        const [u] = await db.insert(user).values({
          id: testUserId,
          name: "Instagram Shop Owner",
          email: "shop@instagram.com",
        }).returning();
        if (u) {
          users.push(u);
          console.log("Added Instagram Shop Owner user.");
        }
      }
    }

    for (const u of users) {
      console.log(`\n--- Seeding for User: ${u.name} (ID: ${u.id}) ---`);

      // 2. Business Profile
      const [existingProfile] = await db
        .select()
        .from(businessProfile)
        .where(eq(businessProfile.userId, u.id));
      
      if (!existingProfile) {
        await db.insert(businessProfile).values({
          userId: u.id,
          name: `${u.name}'s Shop`,
          description: "Your one-stop premium retail experience.",
          currency: "BDT",
          defaultShippingCost: 6000, // 60 BDT (stored in cents/minor units)
          supportEmail: `support@${u.id.substring(0, 8)}.com`,
          supportPhone: "01700000000",
        });
        console.log("Seeded Business Profile.");
      }

      // 3. Shipping Rates
      const existingRates = await db
        .select()
        .from(shippingRate)
        .where(eq(shippingRate.userId, u.id));
      
      if (existingRates.length === 0) {
        const rates = DISTRICTS.map((district) => ({
          userId: u.id,
          district,
          cost: district === "Dhaka" ? 6000 : 12000, // 60 BDT or 120 BDT
          estimatedDays: district === "Dhaka" ? 2 : 4,
          active: true,
        }));
        await db.insert(shippingRate).values(rates);
        console.log(`Seeded ${rates.length} Shipping Rates.`);
      }

      // 4. FAQs
      const existingFaqs = await db
        .select()
        .from(faq)
        .where(eq(faq.userId, u.id));
      
      if (existingFaqs.length === 0) {
        const faqs = FAQ_ITEMS.map((item) => ({
          userId: u.id,
          question: item.q,
          answer: item.a,
        }));
        await db.insert(faq).values(faqs);
        console.log(`Seeded ${faqs.length} FAQs.`);
      }

      // 5. Policies
      const existingPolicies = await db
        .select()
        .from(policy)
        .where(eq(policy.userId, u.id));
      
      if (existingPolicies.length === 0) {
        const policies = [
          { type: "shipping", title: "Shipping & Delivery Policy", body: "We deliver across Bangladesh. Inside Dhaka is 60 BDT, outside Dhaka is 120 BDT." },
          { type: "return", title: "Return & Refund Policy", body: "We accept returns within 7 days. Products must be unused and in their original packaging." },
          { type: "warranty", title: "Warranty Policy", body: "All electric and smart accessories carry a 6-month replacement warranty. Fashion and Decor do not carry warranty." },
          { type: "privacy", title: "Privacy Policy", body: "We protect your data. Your shipping address and contact details are used solely to fulfill orders." },
          { type: "terms", title: "Terms of Service", body: "By ordering, you agree to fulfill the delivery cost. COD orders must be checked in front of delivery agent." },
        ].map((p) => ({ ...p, userId: u.id, active: true }));
        await db.insert(policy).values(policies);
        console.log(`Seeded ${policies.length} Policies.`);
      }

      // 6. Offers (Discount Coupons)
      const existingOffers = await db
        .select()
        .from(offer)
        .where(eq(offer.userId, u.id));
      
      if (existingOffers.length === 0) {
        const offers = [
          { title: "Welcome 10%", code: "WELCOME10", description: "10% off for first-time customers", type: "percentage", value: 10, minSubtotal: 50000 }, // min 500 BDT
          { title: "Flat 200 BDT Off", code: "SAVE200", description: "200 BDT off on orders over 1500 BDT", type: "fixed", value: 20000, minSubtotal: 150000 },
          { title: "Flash Sale 15%", code: "FLASH15", description: "15% off during flash sale", type: "percentage", value: 15, minSubtotal: 100000 },
        ].map((o) => ({
          ...o,
          userId: u.id,
          active: true,
          startDate: new Date(),
        }));
        await db.insert(offer).values(offers);
        console.log(`Seeded ${offers.length} Offers.`);
      }

      // 7. Customers (50 customers per user)
      let seededCustomers = await db
        .select()
        .from(customer)
        .where(eq(customer.userId, u.id));
      
      if (seededCustomers.length < 50) {
        const customersToCreate = [];
        const currentCount = seededCustomers.length;
        const phoneSet = new Set(seededCustomers.map((c) => c.phone));
        
        for (let i = currentCount; i < 50; i++) {
          const name = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length]!;
          const nameClean = name.toLowerCase().replace(/\s+/g, "");
          const email = `${nameClean}${i}@example.com`;
          
          let phone = `0171${String(Math.floor(1000000 + Math.random() * 9000000))}`;
          while (phoneSet.has(phone)) {
            phone = `0171${String(Math.floor(1000000 + Math.random() * 9000000))}`;
          }
          phoneSet.add(phone);

          customersToCreate.push({
            userId: u.id,
            name,
            phone,
            email,
            address: `House ${10 + i}, Road ${i}, Sector 12, Uttara`,
            district: DISTRICTS[i % DISTRICTS.length]!,
            notes: "Regular shopper",
          });
        }
        
        if (customersToCreate.length > 0) {
          const newCusts = await db.insert(customer).values(customersToCreate).returning();
          seededCustomers = [...seededCustomers, ...newCusts];
          console.log(`Seeded ${customersToCreate.length} new Customers.`);
        }
      }

      // 8. Products (at least 100 products per user)
      let seededProducts = await db
        .select()
        .from(product)
        .where(eq(product.userId, u.id));
      
      if (seededProducts.length < 100) {
        const productsToCreate = [];
        const currentCount = seededProducts.length;
        const needed = 100 - currentCount;
        console.log(`Need to seed ${needed} products to reach 100...`);

        const allCategories = Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>;
        
        for (let i = 0; i < needed; i++) {
          const adj = ADJECTIVES[(currentCount + i) % ADJECTIVES.length]!;
          const catName = allCategories[(currentCount + i) % allCategories.length]!;
          const itemNames = CATEGORIES[catName];
          const itemName = itemNames[i % itemNames.length]!;
          const title = `${adj} ${itemName}`;
          
          productsToCreate.push({
            userId: u.id,
            title,
            description: `This is a high quality, premium ${title.toLowerCase()} from our latest ${catName.toLowerCase()} collection. Durable design and exceptional utility.`,
            images: [`https://picsum.photos/seed/${encodeURIComponent(title)}/600/400`],
            options: [
              { name: "Color", values: ["Black", "Silver", "Navy"] },
              { name: "Size", values: ["Regular", "Pro"] }
            ],
            status: "active",
          });
        }

        // Insert products and their variants
        for (const pVal of productsToCreate) {
          const [insertedProd] = await db.insert(product).values(pVal).returning();
          if (insertedProd) {
            seededProducts.push(insertedProd);
            
            // Create 2 variants for each product
            const variants = [
              {
                productId: insertedProd.id,
                title: "Regular / Black",
                option1: "Black",
                option2: "Regular",
                price: (15 + Math.floor(Math.random() * 85)) * 10000, // 1500 to 10000 BDT in minor units
                compareAtPrice: null,
                sku: `SKU-${insertedProd.id.substring(0, 6).toUpperCase()}-BLK-REG`,
                inventoryQuantity: 10 + Math.floor(Math.random() * 90),
                imageUrl: insertedProd.images[0] ?? null,
              },
              {
                productId: insertedProd.id,
                title: "Pro / Silver",
                option1: "Silver",
                option2: "Pro",
                price: (25 + Math.floor(Math.random() * 95)) * 10000,
                compareAtPrice: null,
                sku: `SKU-${insertedProd.id.substring(0, 6).toUpperCase()}-SLV-PRO`,
                inventoryQuantity: 5 + Math.floor(Math.random() * 45),
                imageUrl: insertedProd.images[0] ?? null,
              }
            ];
            await db.insert(productVariant).values(variants);
          }
        }
        console.log(`Successfully reached 100+ Products and variants.`);
      }

      // 9. Orders (at least 50 orders per user)
      const existingOrders = await db
        .select()
        .from(order)
        .where(eq(order.userId, u.id));
      
      if (existingOrders.length < 50) {
        const neededOrders = 50 - existingOrders.length;
        console.log(`Seeding ${neededOrders} orders...`);

        // Fetch variants for calculations
        const allProductIds = seededProducts.map((p) => p.id);
        const variants = await db
          .select()
          .from(productVariant)
          .where(inArray(productVariant.productId, allProductIds));
        
        if (variants.length === 0) {
          console.error("No variants found to seed orders.");
          continue;
        }

        const orderStatuses = ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled"];
        const channels = ["messenger", "instagram", "whatsapp", "web"];

        for (let i = 0; i < neededOrders; i++) {
          const cust = seededCustomers[i % seededCustomers.length]!;
          const ordStatus = orderStatuses[i % orderStatuses.length]!;
          const channel = channels[i % channels.length]!;
          
          // Select 1-3 random variants
          const selectedVariants = [];
          const numItems = 1 + Math.floor(Math.random() * 2);
          for (let j = 0; j < numItems; j++) {
            const v = variants[Math.floor(Math.random() * variants.length)]!;
            selectedVariants.push(v);
          }

          // Calculate subtotal
          let subtotal = 0;
          const itemsData = [];
          
          for (const variant of selectedVariants) {
            const qty = 1 + Math.floor(Math.random() * 2);
            const lineTotal = variant.price * qty;
            subtotal += lineTotal;

            // Fetch the parent product info
            const prod = seededProducts.find((p) => p.id === variant.productId);
            
            itemsData.push({
              productId: variant.productId,
              variantId: variant.id,
              name: prod?.title ?? "Product Title",
              variantTitle: variant.title,
              sku: variant.sku,
              qty,
              unitPrice: variant.price,
              lineTotal,
              imageUrl: variant.imageUrl,
            });
          }

          const shippingCost = cust.district === "Dhaka" ? 6000 : 12000;
          const discountAmount = i % 5 === 0 ? 10000 : 0; // 100 BDT off for every 5th order
          const total = subtotal + shippingCost - discountAmount;

          const [createdOrder] = await db
            .insert(order)
            .values({
              userId: u.id,
              customerId: cust.id,
              orderNumber: `SP-${Date.now()}-${i}`,
              status: ordStatus,
              subtotal,
              shippingCost,
              discountAmount,
              total,
              customerName: cust.name,
              customerPhone: cust.phone,
              customerEmail: cust.email,
              shippingAddress: cust.address,
              shippingDistrict: cust.district,
              couponCode: discountAmount > 0 ? "WELCOME10" : null,
              channel,
              threadId: `${channel}_thread_${i}_${Date.now()}`,
              notes: "Please call before delivery.",
            })
            .returning();

          if (createdOrder) {
            const orderItemsToInsert = itemsData.map((item) => ({
              ...item,
              orderId: createdOrder.id,
            }));
            await db.insert(orderItem).values(orderItemsToInsert);
          }
        }
        console.log(`Seeded ${neededOrders} Orders with items successfully.`);
      }
    }

    console.log("\n=== DATABASE SEEDING COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("Seeding failed with error:", error);
  }
  process.exit(0);
}

void main();
