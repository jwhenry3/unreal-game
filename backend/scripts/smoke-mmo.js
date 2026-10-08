const baseUrl = process.env.BASE_URL || 'http://localhost:3100';
const serviceKey = process.env.INTERNAL_API_KEY || 'local-smoke-service-key';
const suffix = Date.now().toString(36);
let failures = 0;

async function api(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.serviceKey) headers['x-service-key'] = options.serviceKey;

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function check(name, condition, details) {
  if (condition) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}`, details);
}

async function expectStatus(name, path, expected, options) {
  const result = await api(path, options);
  check(
    name,
    Array.isArray(expected) ? expected.includes(result.status) : result.status === expected,
    { expected, actual: result.status, data: result.data },
  );
  return result;
}

async function main() {
  await expectStatus('health', '/health', 200);
  await expectStatus('internal-no-key', '/internal/events', 401);
  await expectStatus('internal-bad-key', '/internal/events', 401, {
    serviceKey: 'wrong-key',
  });

  const userA = await expectStatus('register-user-a', '/auth/register', 201, {
    method: 'POST',
    body: {
      username: `smoke_a_${suffix}`,
      email: `smoke_a_${suffix}@example.com`,
      password: 'Password123!',
    },
  });
  const userB = await expectStatus('register-user-b', '/auth/register', 201, {
    method: 'POST',
    body: {
      username: `smoke_b_${suffix}`,
      email: `smoke_b_${suffix}@example.com`,
      password: 'Password123!',
    },
  });
  const tokenA = userA.data.accessToken;
  const tokenB = userB.data.accessToken;

  const characterA = await expectStatus('create-character-a', '/characters', 201, {
    method: 'POST',
    token: tokenA,
    body: {
      name: `SmokeA${suffix}`,
      realm: 'North America',
      job: 'Warrior',
      subJob: 'Monk',
    },
  });
  const characterB = await expectStatus('create-character-b', '/characters', 201, {
    method: 'POST',
    token: tokenB,
    body: { name: `SmokeB${suffix}`, realm: 'North America', job: 'Mage' },
  });
  const characterAId = characterA.data.id;
  const characterBId = characterB.data.id;

  await expectStatus(
    'character-ownership-rejected',
    `/characters/${characterAId}`,
    404,
    { token: tokenB },
  );
  const updatedA = await expectStatus(
    'internal-character-state',
    `/internal/characters/${characterAId}/state`,
    200,
    {
      method: 'PATCH',
      serviceKey,
      body: {
        mapName: 'Starter Zone',
        position: { x: 10, y: 20, z: 0 },
        state: { quest: 'intro' },
      },
    },
  );
  check(
    'character-state-values',
    updatedA.data.mapName === 'Starter Zone' &&
      updatedA.data.level === undefined &&
      updatedA.data.experience === undefined,
    updatedA.data,
  );

  const initialJobs = await expectStatus(
    'character-jobs-created',
    `/internal/characters/${characterAId}/jobs`,
    200,
    { serviceKey },
  );
  check(
    'character-initial-jobs',
    initialJobs.data.length === 2 &&
      initialJobs.data.some((job) => job.jobKey === 'warrior') &&
      initialJobs.data.some((job) => job.jobKey === 'monk'),
    initialJobs.data,
  );
  const warriorProgress = await expectStatus(
    'character-job-progress',
    `/internal/characters/${characterAId}/jobs/warrior`,
    200,
    {
      method: 'PUT',
      serviceKey,
      body: { level: 5, experience: 1200 },
    },
  );
  check(
    'character-job-progress-values',
    warriorProgress.data.level === 5 && warriorProgress.data.experience === 1200,
    warriorProgress.data,
  );
  await expectStatus(
    'character-same-job-rejected',
    `/internal/characters/${characterAId}/jobs`,
    400,
    {
      method: 'PATCH',
      serviceKey,
      body: { mainJob: 'Monk', subJob: 'Monk' },
    },
  );
  const switchedJobs = await expectStatus(
    'character-job-switch',
    `/internal/characters/${characterAId}/jobs`,
    200,
    {
      method: 'PATCH',
      serviceKey,
      body: { mainJob: 'Monk', subJob: 'Ranger' },
    },
  );
  check(
    'character-job-switch-values',
    switchedJobs.data.mainJob === 'monk' &&
      switchedJobs.data.subJob === 'ranger' &&
      switchedJobs.data.jobProgress.some((job) => job.jobKey === 'ranger'),
    switchedJobs.data,
  );

  await expectStatus('grant-currency-a', `/internal/characters/${characterAId}/currency`, 201, {
    method: 'POST',
    serviceKey,
    body: { amount: 1000 },
  });
  await expectStatus('grant-currency-b', `/internal/characters/${characterBId}/currency`, 201, {
    method: 'POST',
    serviceKey,
    body: { amount: 500 },
  });

  const auctionItem = await expectStatus(
    'internal-add-auction-item',
    `/internal/characters/${characterAId}/inventory/items`,
    201,
    {
      method: 'POST',
      serviceKey,
      body: { itemKey: 'smoke_sword', quantity: 1, metadata: { rarity: 'rare' } },
    },
  );
  const playerInventory = await expectStatus(
    'player-inventory-list',
    `/characters/${characterAId}/inventory`,
    200,
    { token: tokenA },
  );
  check('player-inventory-owned', playerInventory.data.some((item) => item.id === auctionItem.data.id), playerInventory.data);
  await expectStatus(
    'player-inventory-mint-rejected',
    `/characters/${characterAId}/inventory/items`,
    404,
    { method: 'POST', token: tokenA, body: { itemKey: 'forged_item', quantity: 1 } },
  );

  const listing = await expectStatus(
    'auction-create',
    `/characters/${characterAId}/auction/listings`,
    201,
    {
      method: 'POST',
      token: tokenA,
      body: {
        inventoryItemId: auctionItem.data.id,
        startingBid: 100,
        buyoutPrice: 300,
        durationHours: 1,
      },
    },
  );
  await expectStatus(
    'auction-bid',
    `/characters/${characterBId}/auction/listings/${listing.data.id}/bid`,
    201,
    { method: 'POST', token: tokenB, body: { amount: 150 } },
  );
  await expectStatus(
    'auction-self-outbid-rejected',
    `/characters/${characterBId}/auction/listings/${listing.data.id}/bid`,
    400,
    { method: 'POST', token: tokenB, body: { amount: 160 } },
  );
  await expectStatus(
    'auction-cancel',
    `/characters/${characterAId}/auction/listings/${listing.data.id}/cancel`,
    201,
    { method: 'POST', token: tokenA },
  );
  const bidderAfterCancel = await expectStatus(
    'auction-bid-refunded',
    `/internal/characters/${characterBId}`,
    200,
    { serviceKey },
  );
  check('auction-refund-amount', bidderAfterCancel.data.currency === 500, bidderAfterCancel.data);

  const buyoutItem = await expectStatus(
    'internal-add-buyout-item',
    `/internal/characters/${characterAId}/inventory/items`,
    201,
    {
      method: 'POST',
      serviceKey,
      body: { itemKey: 'smoke_shield', quantity: 1 },
    },
  );
  const buyoutListing = await expectStatus(
    'auction-buyout-listing',
    `/characters/${characterAId}/auction/listings`,
    201,
    {
      method: 'POST',
      token: tokenA,
      body: {
        inventoryItemId: buyoutItem.data.id,
        startingBid: 100,
        buyoutPrice: 250,
        durationHours: 1,
      },
    },
  );
  await expectStatus(
    'auction-buyout',
    `/characters/${characterBId}/auction/listings/${buyoutListing.data.id}/buyout`,
    201,
    { method: 'POST', token: tokenB },
  );
  const buyerInventory = await expectStatus(
    'auction-item-transferred',
    `/internal/characters/${characterBId}/inventory`,
    200,
    { serviceKey },
  );
  check(
    'auction-item-owner',
    buyerInventory.data.some((item) => item.id === buyoutItem.data.id),
    buyerInventory.data,
  );

  const mailItem = await expectStatus(
    'internal-add-mail-item',
    `/internal/characters/${characterAId}/inventory/items`,
    201,
    {
      method: 'POST',
      serviceKey,
      body: { itemKey: 'smoke_potion', quantity: 3 },
    },
  );
  const sentMail = await expectStatus(
    'mail-send-with-inventory-item',
    `/characters/${characterAId}/mail`,
    201,
    {
      method: 'POST',
      token: tokenA,
      body: {
        recipientCharacterId: characterBId,
        subject: 'Smoke attachment',
        body: 'Claim this item.',
        attachments: [{ inventoryItemId: mailItem.data.id }],
      },
    },
  );
  await expectStatus(
    'mail-claim-ownership-rejected',
    `/characters/${characterAId}/mail/${sentMail.data.id}/claim`,
    404,
    { method: 'POST', token: tokenA },
  );
  await expectStatus(
    'mail-read',
    `/characters/${characterBId}/mail/${sentMail.data.id}/read`,
    201,
    { method: 'POST', token: tokenB },
  );
  const claimedMail = await expectStatus(
    'mail-claim',
    `/characters/${characterBId}/mail/${sentMail.data.id}/claim`,
    201,
    { method: 'POST', token: tokenB },
  );
  check('mail-claim-returned-item', claimedMail.data.items.length === 1, claimedMail.data);

  const systemMail = await expectStatus('internal-mail-currency', '/internal/mail', 201, {
    method: 'POST',
    serviceKey,
    body: {
      recipientCharacterId: characterBId,
      subject: 'System grant',
      body: 'Currency attached.',
      attachments: [{ type: 'currency', currency: 50 }],
    },
  });
  await expectStatus(
    'internal-mail-currency-claim',
    `/characters/${characterBId}/mail/${systemMail.data.id}/claim`,
    201,
    { method: 'POST', token: tokenB },
  );

  const plot = await expectStatus('housing-create-plot', '/internal/housing/plots', 201, {
    method: 'POST',
    serviceKey,
    body: {
      realm: 'North America',
      district: 'Smoke District',
      plotKey: `plot-${suffix}`,
      sizeTier: 'standard',
    },
  });
  await expectStatus(
    'housing-claim',
    `/characters/${characterAId}/house/claim/${plot.data.id}`,
    201,
    { method: 'POST', token: tokenA },
  );
  await expectStatus('housing-update', `/characters/${characterAId}/house`, 200, {
    method: 'PATCH',
    token: tokenA,
    body: { name: 'Smoke House', isPublic: true },
  });
  const furnishingItem = await expectStatus(
    'internal-add-furnishing-item',
    `/internal/characters/${characterAId}/inventory/items`,
    201,
    {
      method: 'POST',
      serviceKey,
      body: { itemKey: 'smoke_chair', quantity: 1 },
    },
  );
  const furnishing = await expectStatus(
    'housing-place-furnishing',
    `/characters/${characterAId}/house/furnishings`,
    201,
    {
      method: 'POST',
      token: tokenA,
      body: {
        inventoryItemId: furnishingItem.data.id,
        transform: { x: 1, y: 2, z: 0, yaw: 90 },
      },
    },
  );
  await expectStatus(
    'housing-ownership-rejected',
    `/characters/${characterAId}/house`,
    404,
    { method: 'PATCH', token: tokenB, body: { name: 'Stolen House' } },
  );
  await expectStatus(
    'housing-remove-furnishing',
    `/characters/${characterAId}/house/furnishings/${furnishing.data.id}`,
    200,
    { method: 'DELETE', token: tokenA },
  );
  await expectStatus('housing-release', `/characters/${characterAId}/house`, 200, {
    method: 'DELETE',
    token: tokenA,
  });

  const state = await expectStatus(
    'state-put',
    `/internal/state/character/${characterAId}/quest.main`,
    200,
    {
      method: 'PUT',
      serviceKey,
      body: { value: { step: 1 }, expectedVersion: 0 },
    },
  );
  check('state-version-created', state.data.version === 1, state.data);
  await expectStatus(
    'state-version-update',
    `/internal/state/character/${characterAId}/quest.main`,
    200,
    {
      method: 'PUT',
      serviceKey,
      body: { value: { step: 2 }, expectedVersion: 1 },
    },
  );
  await expectStatus(
    'state-version-conflict',
    `/internal/state/character/${characterAId}/quest.main`,
    409,
    {
      method: 'PUT',
      serviceKey,
      body: { value: { step: 3 }, expectedVersion: 1 },
    },
  );
  const batch = await expectStatus(
    'state-batch',
    `/internal/state/character/${characterAId}/batch`,
    201,
    {
      method: 'POST',
      serviceKey,
      body: {
        entries: [
          { key: 'position', value: { x: 5, y: 6 } },
          { key: 'settings', value: { uiScale: 1 } },
        ],
      },
    },
  );
  check('state-batch-count', batch.data.length === 2, batch.data);

  const event = await expectStatus('event-emit', '/internal/events', 201, {
    method: 'POST',
    serviceKey,
    body: {
      type: 'smoke.test',
      aggregateType: 'character',
      aggregateId: characterAId,
      payload: { ok: true },
      idempotencyKey: `smoke-${suffix}`,
    },
  });
  const duplicateEvent = await expectStatus('event-idempotent', '/internal/events', 201, {
    method: 'POST',
    serviceKey,
    body: {
      type: 'smoke.test',
      aggregateType: 'character',
      aggregateId: characterAId,
      payload: { ok: true },
      idempotencyKey: `smoke-${suffix}`,
    },
  });
  check('event-idempotent-id', duplicateEvent.data.id === event.data.id, duplicateEvent.data);
  await expectStatus(
    'event-processed',
    `/internal/events/${event.data.id}/processed`,
    201,
    { method: 'POST', serviceKey },
  );
  const unprocessed = await expectStatus('event-list', '/internal/events', 200, {
    serviceKey,
  });
  check(
    'event-processed-filtered',
    !unprocessed.data.some((candidate) => candidate.id === event.data.id),
    unprocessed.data,
  );

  await expectStatus('auction-expiry-scan', '/internal/auctions/process-expired', 201, {
    method: 'POST',
    serviceKey,
  });

  if (failures > 0) {
    throw new Error(`${failures} smoke checks failed.`);
  }
  console.log('MMO backend smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
