mic# Sharing Databases in Microservices: Anti-Pattern or Practical?

---

## What are Microservices?

Think of a big food court. Each stall (Pizza, Burger, Sushi) operates independently — they have their own staff, their own menu, their own kitchen. But they all serve customers in the same building.

**Microservices work the same way.** Instead of one giant app, you split your system into small, independent services:

- `User Service` → handles login, signup
- `Order Service` → handles placing orders
- `Payment Service` → handles payments
- `Inventory Service` → handles stock

Each service does one thing well and runs independently.

---

## The Problem: How Do Services Talk to Each Other?

Imagine the Order Service needs to check if a user exists before placing an order. It needs data from the User Service.

### The "Proper" Way — API Calls Between Services

```
Order Service  →  HTTP Request  →  User Service  →  Returns user data
```

This is the textbook approach. Services talk through APIs — no one touches each other's database directly.

**But this adds complexity:**
- You need to build and maintain those APIs
- Network calls add latency
- If User Service is down, Order Service breaks too

---

## The Shared Database Pattern

Instead of calling each other's APIs, all services just read/write to **the same database**.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Service  │     │  Order Service  │     │ Payment Service │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                        │
         └───────────────────────┴────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Shared Database      │
                    │  (users, orders, items)  │
                    └─────────────────────────┘
```

**Order Service** can directly query the `users` table without calling the User Service API.

```sql
-- Order Service directly queries users table
SELECT * FROM users WHERE user_id = 123;
```

Simple. Fast. No extra API needed.

---

## Real World Example: E-Commerce App

Let's say you're building an e-commerce platform with 3 services:

| Service          | Responsibility          |
|------------------|-------------------------|
| User Service     | User accounts & profiles|
| Order Service    | Placing & tracking orders|
| Inventory Service| Product stock management |

### Without Shared DB (API approach)

When a user places an order:

```
1. Order Service → asks User Service: "Is user 123 valid?"
2. Order Service → asks Inventory Service: "Is item 456 in stock?"
3. Order Service → places the order
```

Three network calls. Three possible failure points. More code to write.

### With Shared DB

```sql
-- Order Service does everything in one query
SELECT u.name, i.stock
FROM users u, inventory i
WHERE u.user_id = 123 AND i.item_id = 456;
```

One query. Done. Much faster for a small team.

---

## Advantages of Shared Database

### 1. Quick Development
No need to build APIs between services. Just write a SQL query.

**Example:** A startup with 3 engineers can ship features in days instead of weeks because they skip the API layer entirely.

### 2. Better Performance
Direct database queries are faster than HTTP API calls between services.

```
API Call:  Order Service → HTTP → User Service → DB query → HTTP back
           ~50-200ms round trip

Shared DB: Order Service → DB query directly
           ~5-20ms
```

### 3. Simpler Architecture
Fewer moving parts = fewer things to break.

---

## Disadvantages of Shared Database

### 1. Exposing Internal Details

When Order Service directly reads the `users` table, it knows the **internal structure** of User Service's data.

```sql
-- Order Service now knows about internal columns it shouldn't care about
SELECT user_id, email, password_hash, stripe_customer_id FROM users;
```

If User Service renames a column or changes its schema, **Order Service breaks** — even though it's supposed to be independent.

**Real world analogy:** It's like letting a customer walk into your kitchen and grab their own food. They now know all your secret recipes.

### 2. Data Corruption Risk

If two services write to the same table without coordination, data can become inconsistent.

```
Order Service writes:   UPDATE inventory SET stock = stock - 1 WHERE item_id = 456;
Inventory Service writes at the same time: UPDATE inventory SET stock = 10 WHERE item_id = 456;

Result: Stock is wrong. Orders may go through for out-of-stock items.
```

**Real world analogy:** Two cashiers both editing the same spreadsheet at the same time — the numbers get overwritten.

### 3. Shared Business Logic

Business rules that belong to one service leak into others.

**Example:** The rule "never let stock go below 0" should live in Inventory Service. But if Order Service is directly updating the inventory table, it has to duplicate that logic too.

Now if the rule changes, you update it in two places. Miss one → bugs.

```
❌ Bad: Business logic duplicated
   - Inventory Service: if stock > 0 → allow order
   - Order Service: if stock > 0 → decrement stock   ← duplicate logic

✅ Good: Logic in one place
   - Order Service → calls Inventory Service API
   - Inventory Service handles its own rules
```

### 4. Tight Coupling

Services that were supposed to be independent are now tightly coupled through the database. You can't update, scale, or replace one service without affecting others.

```
Scenario: You want to switch from PostgreSQL to MongoDB for User Service.

Without Shared DB: Easy — only User Service changes.
With Shared DB:    All services break because they were all querying the same DB.
```

---

## When Should You Use It?

```
┌─────────────────────────────────────────────────────┐
│              Should I share the database?            │
└─────────────────────────────┬───────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  Is your team small (1-5 devs) │
              │  and moving fast?              │
              └───────────────┬───────────────┘
                    │                │
                   YES               NO
                    │                │
                    ▼                ▼
        ┌───────────────────┐   ┌───────────────────────┐
        │ Shared DB might   │   │ Use proper APIs        │
        │ be fine for now   │   │ between services       │
        └───────────────────┘   └───────────────────────┘
```

### Use Shared DB when:
- You're a **small team** that needs to ship fast
- It's an **internal tool** — not customer-facing at scale
- You plan to **refactor later** once the product is proven
- The **performance gain** is critical for your use case

### Avoid Shared DB when:
- Different teams own different services
- You need services to be **independently deployable**
- You're at **scale** with many concurrent writes
- **Data integrity** is critical (banking, healthcare)

---

## Summary

| Feature                  | Shared Database        | API Between Services   |
|--------------------------|------------------------|------------------------|
| Development speed        | Fast                   | Slower                 |
| Performance              | Better                 | More network overhead  |
| Independence of services | Low (tightly coupled)  | High (loosely coupled) |
| Risk of data corruption  | Higher                 | Lower                  |
| Best for                 | Small teams, MVPs      | Large teams, production|

---

## The Honest Answer: Anti-Pattern OR Practical?

**Both.** It depends on context.

- For a **10-person startup** building an MVP → Shared DB is a pragmatic shortcut. Ship fast, validate, then fix it.
- For a **100-person company** with multiple teams owning services → it becomes a maintenance nightmare. Use APIs.

The pattern isn't evil — it's just a **trade-off**. Know the costs, make the call consciously, and have a plan to move away from it when you outgrow it.
