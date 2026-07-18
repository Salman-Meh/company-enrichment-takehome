-- =============================================================================
-- 0002_seed_companies.sql
-- Loads companies_seed.json verbatim. Data is deliberately messy (near-dupe
-- "siemens" row, inconsistent empty-string vs null domain, stray whitespace)
-- and is preserved as-is rather than cleaned — that's the enrichment step's
-- problem to reason about, not ingestion's.
-- =============================================================================

insert into public.companies (name, domain, raw_note) values
  ('Siemens AG',       'siemens.com',      'Large industrial/tech conglomerate, Munich. ~300k employees worldwide.'),
  ('siemens',          '',                 'duplicate? munich electronics'),
  ('  Zalando SE',     'zalando.de',       'online fashion retailer berlin'),
  ('DB Schenker',      null,               'Logistics arm of Deutsche Bahn. HQ Essen.'),
  ('N26 GmbH',         'n26.com',          'mobile bank / fintech, Berlin, a few thousand staff'),
  ('Trumpf',           'trumpf.com',       'machine tools + lasers, family-owned, Ditzingen'),
  ('About You',        'aboutyou.com',     'Hamburg e-commerce, fashion'),
  ('Celonis',          'celonis.com',      'process mining software, Munich/NYC, unicorn'),
  ('Personio',         '',                 'HR software for SMEs, München'),
  ('BioNTech SE',      'biontech.de',      'Mainz biotech, mRNA, ~5000 ppl'),
  ('flixbus',          'flixbus.com',      'FlixMobility - buses + trains, Munich'),
  ('GetYourGuide',     'getyourguide.com', 'travel experiences marketplace, Berlin'),
  ('Robert Bosch GmbH','bosch.com',        'engineering + tech, Gerlingen, very large'),
  ('DeepL',            'deepl.com',        'AI translation, Köln'),
  ('Winterhalter',     '',                 'commercial dishwashing systems, Meckenbeuren - mittelstand');
