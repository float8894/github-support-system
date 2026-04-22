import pg from 'pg';
const { Client } = pg;

const c = new Client({
  connectionString:
    'postgresql://github_support:dev_password_change_in_prod@localhost:5434/github_support',
});
await c.connect();

const orgs = await c.query(
  'SELECT org_id, org_name, customer_id FROM github_orgs',
);
const tokens = await c.query(
  'SELECT token_id, token_type, owner FROM token_records LIMIT 3',
);
const customers = await c.query(
  'SELECT customer_id, customer_name FROM customers LIMIT 3',
);

console.log('ORGS:', JSON.stringify(orgs.rows, null, 2));
console.log('TOKENS:', JSON.stringify(tokens.rows, null, 2));
console.log('CUSTOMERS:', JSON.stringify(customers.rows, null, 2));

await c.end();
