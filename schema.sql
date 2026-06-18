-- DCR Clothier Database Schema
-- Run this in your Supabase SQL editor

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  compare_price NUMERIC(10,2),
  category TEXT NOT NULL CHECK (category IN ('tops','bottoms','outerwear','accessories','sets')),
  gender TEXT DEFAULT 'unisex' CHECK (gender IN ('mens','womens','unisex')),
  images TEXT[] DEFAULT '{}',
  sizes TEXT[] DEFAULT '{}',
  stock JSONB DEFAULT '{}',
  featured BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address JSONB NOT NULL,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','processing','shipped','delivered','cancelled')),
  paystack_reference TEXT,
  paystack_verified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generate order number function
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'DCR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Auto-set order number on insert
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Products: public read, service key write
CREATE POLICY "products_public_read" ON products FOR SELECT USING (active = true);
CREATE POLICY "products_service_all" ON products FOR ALL USING (auth.role() = 'service_role');

-- Orders: insert public, read/update service only
CREATE POLICY "orders_insert_public" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_service_all" ON orders FOR ALL USING (auth.role() = 'service_role');

-- Subscribers: insert public
CREATE POLICY "subscribers_insert_public" ON subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "subscribers_service_all" ON subscribers FOR ALL USING (auth.role() = 'service_role');

-- Sample products (remove in production)
INSERT INTO products (name, description, price, category, gender, images, sizes, stock, featured, slug) VALUES
(
  'Oversize Trench Coat',
  'A statement oversize trench in premium wool blend. Clean lapels, dropped shoulders, belted waist. One of those pieces.',
  85000,
  'outerwear',
  'unisex',
  ARRAY['https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800'],
  ARRAY['XS','S','M','L','XL'],
  '{"XS":3,"S":5,"M":8,"L":6,"XL":4}',
  true,
  'oversize-trench-coat'
),
(
  'Patchwork Oxford Shirt',
  'Heritage patchwork meets Lagos street. Contrasting fabric panels, relaxed fit, premium cotton.',
  32000,
  'tops',
  'unisex',
  ARRAY['https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800'],
  ARRAY['S','M','L','XL'],
  '{"S":10,"M":15,"L":12,"XL":8}',
  true,
  'patchwork-oxford-shirt'
),
(
  'Fearless Cargo Pants',
  'Utility cargo cut with side zip pockets and tapered leg. Moves with you.',
  45000,
  'bottoms',
  'mens',
  ARRAY['https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800'],
  ARRAY['S','M','L','XL','XXL'],
  '{"S":8,"M":10,"L":10,"XL":7,"XXL":5}',
  true,
  'fearless-cargo-pants'
),
(
  'Studio Graphic Tee',
  'Heavy 280gsm cotton, dropped shoulders, DCR print on chest. Wears once, stays forever.',
  18000,
  'tops',
  'unisex',
  ARRAY['https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800'],
  ARRAY['XS','S','M','L','XL','XXL'],
  '{"XS":5,"S":12,"M":20,"L":18,"XL":10,"XXL":6}',
  false,
  'studio-graphic-tee'
),
(
  'Sky Blue Utility Jacket',
  'Washed sky blue workwear jacket. Chest pockets, contrast stitching, oversized fit.',
  58000,
  'outerwear',
  'unisex',
  ARRAY['https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800'],
  ARRAY['S','M','L','XL'],
  '{"S":4,"M":6,"L":6,"XL":4}',
  true,
  'sky-blue-utility-jacket'
),
(
  'Fearless Shorts',
  'Black technical shorts with embroidered FEARLESS wordmark. Slim tapered cut.',
  22000,
  'bottoms',
  'unisex',
  ARRAY['https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=800'],
  ARRAY['XS','S','M','L','XL'],
  '{"XS":6,"S":10,"M":14,"L":12,"XL":8}',
  false,
  'fearless-shorts'
);
