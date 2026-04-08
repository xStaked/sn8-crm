import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonObject = Record<string, unknown>;

type CommercialKbEntry = {
  serviceId: string;
  category: string;
  complexity: string;
  integration: string;
  durationWeeksMin: number;
  durationWeeksMax: number;
  priceMin: number;
  priceTarget: number;
  priceMax: number;
  mvpFirst: boolean;
  scopeIncluded: string[];
  scopeExcluded: string[];
  assumptions: string[];
  risks: string[];
  upsells: string[];
  source: {
    issue: string;
    documentKey: string;
  };
};

type CommercialKb = {
  version: string;
  updatedAt: string;
  currency: string;
  taxonomies: {
    categories: string[];
    complexity: string[];
    integration: string[];
  };
  offerLadder: Array<{
    tierId: string;
    name: string;
    durationWeeksMin: number;
    durationWeeksMax: number;
    priceMin: number;
    priceMax: number;
    notes: string;
  }>;
  entries: CommercialKbEntry[];
};

function loadJson<T>(absolutePath: string): T {
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as T;
}

function toStringEnum(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Schema field ${field} must be an array of strings.`);
  }

  return value as string[];
}

function getSchemaEnum(schema: JsonObject, path: string[]): string[] {
  let current: unknown = schema;

  for (const part of path) {
    if (!current || typeof current !== 'object') {
      throw new Error(`Schema path not found: ${path.join('.')}.`);
    }

    current = (current as JsonObject)[part];
  }

  return toStringEnum(current, path.join('.'));
}

function asStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`${label} must contain only non-empty strings.`);
    }
  }

  return value as string[];
}

function assertIsoDate(dateValue: string, field: string): void {
  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${field} must be a valid ISO date-time string.`);
  }
}

function assertPositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return value;
}

function assertRange(min: number, target: number, max: number, field: string): void {
  if (!(min <= target && target <= max)) {
    throw new Error(`${field} must satisfy min <= target <= max.`);
  }
}

function assertMinMax(min: number, max: number, field: string): void {
  if (min > max) {
    throw new Error(`${field} must satisfy min <= max.`);
  }
}

function parseEntry(entry: unknown, index: number): CommercialKbEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`entries[${index}] must be an object.`);
  }

  const item = entry as JsonObject;

  const serviceId = item.serviceId;
  const category = item.category;
  const complexity = item.complexity;
  const integration = item.integration;
  const mvpFirst = item.mvpFirst;

  if (typeof serviceId !== 'string' || serviceId.trim().length === 0) {
    throw new Error(`entries[${index}].serviceId must be a non-empty string.`);
  }

  if (typeof category !== 'string' || category.trim().length === 0) {
    throw new Error(`entries[${index}].category must be a non-empty string.`);
  }

  if (typeof complexity !== 'string' || complexity.trim().length === 0) {
    throw new Error(`entries[${index}].complexity must be a non-empty string.`);
  }

  if (typeof integration !== 'string' || integration.trim().length === 0) {
    throw new Error(`entries[${index}].integration must be a non-empty string.`);
  }

  if (typeof mvpFirst !== 'boolean') {
    throw new Error(`entries[${index}].mvpFirst must be boolean.`);
  }

  const durationWeeksMin = assertPositiveInt(
    item.durationWeeksMin,
    `entries[${index}].durationWeeksMin`,
  );
  const durationWeeksMax = assertPositiveInt(
    item.durationWeeksMax,
    `entries[${index}].durationWeeksMax`,
  );
  assertMinMax(durationWeeksMin, durationWeeksMax, `entries[${index}].durationWeeks`);

  const priceMin = assertPositiveInt(item.priceMin, `entries[${index}].priceMin`);
  const priceTarget = assertPositiveInt(item.priceTarget, `entries[${index}].priceTarget`);
  const priceMax = assertPositiveInt(item.priceMax, `entries[${index}].priceMax`);
  assertRange(priceMin, priceTarget, priceMax, `entries[${index}].price`);

  const source = item.source;
  if (!source || typeof source !== 'object') {
    throw new Error(`entries[${index}].source must be an object.`);
  }

  const sourceIssue = (source as JsonObject).issue;
  const sourceDocumentKey = (source as JsonObject).documentKey;
  if (sourceIssue !== 'SNL-41') {
    throw new Error(`entries[${index}].source.issue must be SNL-41.`);
  }

  if (sourceDocumentKey !== 'plan') {
    throw new Error(`entries[${index}].source.documentKey must be plan.`);
  }

  return {
    serviceId,
    category,
    complexity,
    integration,
    durationWeeksMin,
    durationWeeksMax,
    priceMin,
    priceTarget,
    priceMax,
    mvpFirst,
    scopeIncluded: asStringList(item.scopeIncluded, `entries[${index}].scopeIncluded`),
    scopeExcluded: asStringList(item.scopeExcluded, `entries[${index}].scopeExcluded`),
    assumptions: asStringList(item.assumptions, `entries[${index}].assumptions`),
    risks: asStringList(item.risks, `entries[${index}].risks`),
    upsells: asStringList(item.upsells, `entries[${index}].upsells`),
    source: {
      issue: sourceIssue,
      documentKey: sourceDocumentKey,
    },
  };
}

function validate(): void {
  const repoRoot = join(__dirname, '../');
  const schemaPath = join(repoRoot, 'src/ai-sales/knowledge/commercial-kb.schema.v1.json');
  const kbPath = join(repoRoot, 'src/ai-sales/knowledge/commercial-kb.v1.json');

  const schema = loadJson<JsonObject>(schemaPath);
  const kb = loadJson<CommercialKb>(kbPath);

  const schemaVersion = ((schema.properties as JsonObject).version as JsonObject).const;
  const schemaCurrency = ((schema.properties as JsonObject).currency as JsonObject).const;
  const categoriesEnum = getSchemaEnum(schema, [
    'properties',
    'taxonomies',
    'properties',
    'categories',
    'items',
    'enum',
  ]);
  const complexityEnum = getSchemaEnum(schema, [
    'properties',
    'taxonomies',
    'properties',
    'complexity',
    'items',
    'enum',
  ]);
  const integrationEnum = getSchemaEnum(schema, [
    'properties',
    'taxonomies',
    'properties',
    'integration',
    'items',
    'enum',
  ]);

  if (typeof kb.version !== 'string' || kb.version !== schemaVersion) {
    throw new Error(`version must match schema constant (${String(schemaVersion)}).`);
  }

  if (typeof kb.currency !== 'string' || kb.currency !== schemaCurrency) {
    throw new Error(`currency must match schema constant (${String(schemaCurrency)}).`);
  }

  assertIsoDate(kb.updatedAt, 'updatedAt');

  const uniqueCategory = new Set(kb.taxonomies.categories);
  const uniqueComplexity = new Set(kb.taxonomies.complexity);
  const uniqueIntegration = new Set(kb.taxonomies.integration);

  if (uniqueCategory.size !== kb.taxonomies.categories.length) {
    throw new Error('taxonomies.categories must not contain duplicates.');
  }

  if (uniqueComplexity.size !== kb.taxonomies.complexity.length) {
    throw new Error('taxonomies.complexity must not contain duplicates.');
  }

  if (uniqueIntegration.size !== kb.taxonomies.integration.length) {
    throw new Error('taxonomies.integration must not contain duplicates.');
  }

  if (kb.taxonomies.categories.length !== categoriesEnum.length) {
    throw new Error('taxonomies.categories must include the complete approved catalog.');
  }

  if (kb.taxonomies.complexity.length !== complexityEnum.length) {
    throw new Error('taxonomies.complexity must include the complete approved catalog.');
  }

  if (kb.taxonomies.integration.length !== integrationEnum.length) {
    throw new Error('taxonomies.integration must include the complete approved catalog.');
  }

  for (const category of kb.taxonomies.categories) {
    if (!categoriesEnum.includes(category)) {
      throw new Error(`Unknown category in taxonomy: ${category}.`);
    }
  }

  for (const complexity of kb.taxonomies.complexity) {
    if (!complexityEnum.includes(complexity)) {
      throw new Error(`Unknown complexity in taxonomy: ${complexity}.`);
    }
  }

  for (const integration of kb.taxonomies.integration) {
    if (!integrationEnum.includes(integration)) {
      throw new Error(`Unknown integration in taxonomy: ${integration}.`);
    }
  }

  if (!Array.isArray(kb.offerLadder) || kb.offerLadder.length === 0) {
    throw new Error('offerLadder must be a non-empty array.');
  }

  for (let index = 0; index < kb.offerLadder.length; index += 1) {
    const tier = kb.offerLadder[index];

    if (typeof tier.tierId !== 'string' || tier.tierId.trim().length === 0) {
      throw new Error(`offerLadder[${index}].tierId must be a non-empty string.`);
    }

    if (typeof tier.name !== 'string' || tier.name.trim().length === 0) {
      throw new Error(`offerLadder[${index}].name must be a non-empty string.`);
    }

    assertMinMax(
      assertPositiveInt(tier.durationWeeksMin, `offerLadder[${index}].durationWeeksMin`),
      assertPositiveInt(tier.durationWeeksMax, `offerLadder[${index}].durationWeeksMax`),
      `offerLadder[${index}].durationWeeks`,
    );

    assertMinMax(
      assertPositiveInt(tier.priceMin, `offerLadder[${index}].priceMin`),
      assertPositiveInt(tier.priceMax, `offerLadder[${index}].priceMax`),
      `offerLadder[${index}].price`,
    );

    if (typeof tier.notes !== 'string' || tier.notes.trim().length === 0) {
      throw new Error(`offerLadder[${index}].notes must be a non-empty string.`);
    }
  }

  if (!Array.isArray(kb.entries) || kb.entries.length === 0) {
    throw new Error('entries must be a non-empty array.');
  }

  const parsedEntries = kb.entries.map((entry, index) => parseEntry(entry, index));

  const serviceIds = new Set<string>();
  for (const entry of parsedEntries) {
    if (serviceIds.has(entry.serviceId)) {
      throw new Error(`Duplicate serviceId detected: ${entry.serviceId}.`);
    }

    serviceIds.add(entry.serviceId);

    if (!categoriesEnum.includes(entry.category)) {
      throw new Error(`Entry ${entry.serviceId} uses unknown category ${entry.category}.`);
    }

    if (!complexityEnum.includes(entry.complexity)) {
      throw new Error(`Entry ${entry.serviceId} uses unknown complexity ${entry.complexity}.`);
    }

    if (!integrationEnum.includes(entry.integration)) {
      throw new Error(`Entry ${entry.serviceId} uses unknown integration ${entry.integration}.`);
    }
  }

  console.log(
    `Commercial KB valid (${kb.version}): ${parsedEntries.length} entries, ${kb.offerLadder.length} ladder tiers.`,
  );
}

try {
  validate();
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown validation error';
  console.error(`Commercial KB validation failed: ${message}`);
  process.exit(1);
}
