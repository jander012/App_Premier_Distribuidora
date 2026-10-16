-- Data de nascimento do cliente (código de confirmação = ano + dia)
ALTER TABLE customers
  ADD COLUMN birth_date DATE NULL AFTER cpf;

-- Snapshot no pedido para validar entrega mesmo se o perfil mudar
ALTER TABLE orders
  ADD COLUMN customer_birth_date DATE NULL AFTER customer_phone;

-- Marca explícita de finalização (além de delivery_confirmed_at / status)
ALTER TABLE orders
  ADD COLUMN delivered_at DATETIME NULL AFTER delivery_confirmed_at;
