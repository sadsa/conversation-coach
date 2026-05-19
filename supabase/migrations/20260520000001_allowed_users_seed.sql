insert into public.allowed_users (email, status, source, approved_at, approved_by)
values
  ('josh.biddick@gmail.com',           'approved', 'seed', now(), 'system'),
  ('joshua.biddick@entelect.co.nz',    'approved', 'seed', now(), 'system'),
  ('josh.entelect@gmail.com',          'approved', 'seed', now(), 'system'),
  ('luciano.mateu@hotmail.com',        'approved', 'seed', now(), 'system'),
  ('ruben7are@gmail.com',              'approved', 'seed', now(), 'system'),
  ('josh.biddick+newuser@gmail.com',   'approved', 'seed', now(), 'system'),
  ('nahueabasto@gmail.com',            'approved', 'seed', now(), 'system'),
  ('blueinthecloud12345@outlook.com',  'approved', 'seed', now(), 'system')
on conflict (email) do nothing;
