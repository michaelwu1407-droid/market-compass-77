select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'traders'
  and indexname = 'traders_username_unique';
