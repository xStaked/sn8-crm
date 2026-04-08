WITH categories AS (
  SELECT unnest(ARRAY[
    'landing_marketing',
    'web_operativa',
    'crm_sales',
    'vertical_saas',
    'automation_ia'
  ]) AS category
),
complexities AS (
  SELECT unnest(ARRAY['low', 'medium', 'high']) AS complexity
),
integrations AS (
  SELECT unnest(ARRAY['none', 'standard', 'advanced']) AS integration_type
),
matrix AS (
  SELECT
    c.category,
    k.complexity,
    i.integration_type,
    CASE
      WHEN k.complexity = 'high' OR i.integration_type = 'advanced' THEN 'high'
      WHEN k.complexity = 'medium' OR i.integration_type = 'standard' THEN 'medium'
      ELSE 'low'
    END AS risk_tier
  FROM categories c
  CROSS JOIN complexities k
  CROSS JOIN integrations i
),
archived AS (
  UPDATE "PricingRule" current
  SET
    "isActive" = false,
    "archivedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM matrix m
  WHERE current."category" = m.category
    AND current."complexity" = m.complexity
    AND current."integrationType" = m.integration_type
    AND current."isActive" = true
    AND current."archivedAt" IS NULL
),
next_versions AS (
  SELECT
    m.category,
    m.complexity,
    m.integration_type,
    m.risk_tier,
    COALESCE(
      (
        SELECT MAX(existing."version")
        FROM "PricingRule" existing
        WHERE existing."category" = m.category
          AND existing."complexity" = m.complexity
          AND existing."integrationType" = m.integration_type
      ),
      0
    ) + 1 AS next_version
  FROM matrix m
)
INSERT INTO "PricingRule" (
  "id",
  "name",
  "description",
  "category",
  "complexity",
  "integrationType",
  "version",
  "currency",
  "minMarginPct",
  "targetMarginPct",
  "maxMarginPct",
  "scoreWeights",
  "confidenceWeights",
  "isActive",
  "archivedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'pr_v2_' || md5(nv.category || ':' || nv.complexity || ':' || nv.integration_type || ':' || nv.next_version::text),
  'Pricing v2 ' || nv.category || ' / ' || nv.complexity || ' / ' || nv.integration_type,
  'Regla v2 derivada por matriz categoria-complejidad-integracion (riesgo ' || nv.risk_tier || ').',
  nv.category,
  nv.complexity,
  nv.integration_type,
  nv.next_version,
  'COP',
  CASE
    WHEN nv.risk_tier = 'high' THEN 30
    WHEN nv.risk_tier = 'medium' THEN 25
    ELSE 20
  END,
  CASE
    WHEN nv.risk_tier = 'high' THEN 45
    WHEN nv.risk_tier = 'medium' THEN 35
    ELSE 30
  END,
  CASE
    WHEN nv.risk_tier = 'high' THEN 60
    WHEN nv.risk_tier = 'medium' THEN 50
    ELSE 40
  END,
  jsonb_build_object(
    'complexity', 0.35,
    'integrations', 0.25,
    'urgency', 0.20,
    'risk', 0.20
  ),
  jsonb_build_object(
    'transcriptQuality', 0.30,
    'scopeClarity', 0.35,
    'budgetClarity', 0.20,
    'urgencyClarity', 0.15
  ),
  true,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM next_versions nv;
