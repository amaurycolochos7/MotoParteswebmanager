-- Remove the generic user we just created
DELETE FROM profiles WHERE email = 'maestro@motopartes.com';

-- Restore the original motoblaker user
INSERT INTO profiles (id, email, password_hash, full_name, phone, role, commission_percentage, is_active, is_master_mechanic, requires_approval, can_create_services, can_create_appointments, can_send_messages, can_create_clients, can_edit_clients, can_delete_orders, can_view_approved_orders)
VALUES (
  '0dc9ae6e-9d14-4d28-8651-1baf72ea2558',
  'motoblaker91@gmail.com',
  'admin123',
  'Elihu hernandez hernandez',
  '9631911772',
  'admin_mechanic',
  100.00,
  true,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  true
);

-- Also restore the other users
INSERT INTO profiles (id, email, password_hash, full_name, phone, role, commission_percentage, is_active, is_master_mechanic, requires_approval, can_create_services, can_create_appointments, can_send_messages, can_create_clients, can_edit_clients, can_delete_orders, can_view_approved_orders)
VALUES (
  '00a73931-2413-40bf-b362-1ea99c940093',
  'jairoaramires82@gmail.com',
  'jairo123',
  'Jairo ramirez',
  '9921344887',
  'mechanic',
  50.00,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  false,
  false,
  true
);

INSERT INTO profiles (id, email, password_hash, full_name, phone, role, commission_percentage, is_active, is_master_mechanic, requires_approval, can_create_services, can_create_appointments, can_send_messages, can_create_clients, can_edit_clients, can_delete_orders, can_view_approved_orders)
VALUES (
  '9ee8f1e8-a95c-49ca-95ca-be14fa517a28',
  'admin_maestro_motopartes@gmail.com',
  'AdminMaestroMotopartes123321*',
  'Administrador Maestro',
  null,
  'admin',
  0.00,
  true,
  false,
  false,
  false,
  true,
  true,
  true,
  true,
  true,
  true
);

INSERT INTO profiles (id, email, password_hash, full_name, phone, role, commission_percentage, is_active, is_master_mechanic, requires_approval, can_create_services, can_create_appointments, can_send_messages, can_create_clients, can_edit_clients, can_delete_orders, can_view_approved_orders)
VALUES (
  'd1b5a85e-f745-4155-aeaf-2bf1dcff9a3a',
  'maciel77@gmail.com',
  'admin123',
  'Maciel Hernandez hernandez',
  '9921135725',
  'mechanic',
  100.00,
  true,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  true
);
