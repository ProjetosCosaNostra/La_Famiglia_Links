from pathlib import Path
import sqlite3

ROOT=Path(__file__).resolve().parents[1]
con=sqlite3.connect(':memory:')
cur=con.cursor()
cur.executescript('''
PRAGMA foreign_keys=ON;
CREATE TABLE products(id TEXT PRIMARY KEY);
CREATE TABLE product_links(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id TEXT NOT NULL,
 slot INTEGER NOT NULL,
 affiliate_url TEXT,
 is_active INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE system_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
''')
for i in range(1,9):
    pid=f'bg-us-{i:04d}'
    cur.execute('INSERT INTO products(id) VALUES(?)',(pid,))
    cur.execute('INSERT INTO product_links(product_id,slot,affiliate_url) VALUES(?,?,?)',(pid,1,f'https://meli.la/test{i}'))
con.commit()

for name in ['012_marketplace_reconciliation.sql','013_seed_marketplace_reconciliation.sql','014_affiliate_link_marketplace_identity.sql']:
    con.executescript((ROOT/'db'/name).read_text(encoding='utf-8'))

assert cur.execute('SELECT COUNT(*) FROM marketplace_reconciliation').fetchone()[0] == 8
counts=dict(cur.execute('SELECT classification,COUNT(*) FROM marketplace_reconciliation GROUP BY classification'))
assert counts == {'conflict':3,'probable':2,'unresolved':3}, counts
cols={r[1] for r in cur.execute('PRAGMA table_info(product_links)')}
required={'marketplace_item_id','marketplace_variation_id','marketplace_catalog_product_id','marketplace_identity_status','marketplace_seller_id','marketplace_seller_level','marketplace_last_checked_at','marketplace_last_reason'}
assert required <= cols, required-cols
assert cur.execute("SELECT value FROM system_settings WHERE key='affiliate_identity_model'").fetchone()[0] == 'link_listing_v1'
assert cur.execute("SELECT COUNT(*) FROM product_links WHERE marketplace_identity_status='pending'").fetchone()[0] == 8
print('MIGRATION_CONTRACT=PASS')
