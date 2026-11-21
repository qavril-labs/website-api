import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { DEMO_SLOTS, INTERESTS } from "../src/schema.js";
import { MemoryLeadStore } from "../src/store.js";

const contract = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "contract", "lead-form.contract.json"), "utf8"));
const SITE = "https://qavrillabs.com";

const valid = {
  name: "Asha Rao", email: "Asha@Example.com", company: "Sample Co", country: "India", interest: "demo",
  slot: "Monday morning", timezone: "Asia/Kolkata", consent: true,
};

describe("lead intake", () => {
  let store: MemoryLeadStore;
  let notified: Record<string, unknown>[];
  let app: ReturnType<typeof buildApp>;
  let clock: number;

  beforeEach(() => {
    store = new MemoryLeadStore();
    notified = [];
    clock = Date.parse("2026-11-21T09:00:00Z");
    app = buildApp({
      store, corsOrigins: [SITE], now: () => new Date(clock),
      notify: async (lead) => { notified.push(lead); },
    });
  });

  const post = (payload: unknown, headers: Record<string, string> = {}, ip = "203.0.113.5") =>
    app.inject({ method: "POST", url: "/v1/public/leads", payload: payload as object, headers, remoteAddress: ip });

  it("stores a valid lead with the email lowercased and notifies once", async () => {
    const res = await post(valid);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "received" });
    expect(store.leads).toHaveLength(1);
    expect(store.leads[0]!.email).toBe("asha@example.com");
    expect(notified).toHaveLength(1);
  });

  it("does not store the same email and interest twice within a day", async () => {
    await post(valid);
    clock += 60 * 60 * 1000;
    const again = await post(valid);
    expect(again.statusCode).toBe(201);
    expect(store.leads).toHaveLength(1);
    expect(notified).toHaveLength(1);
  });

  it("stores again after a day has passed", async () => {
    await post(valid);
    clock += 25 * 60 * 60 * 1000;
    await post(valid);
    expect(store.leads).toHaveLength(2);
  });

  it("answers a filled honeypot like a real submission but stores nothing", async () => {
    const res = await post({ ...valid, website: "http://spam.example" });
    expect(res.statusCode).toBe(201);
    expect(store.leads).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it("refuses without consent", async () => {
    const res = await post({ ...valid, consent: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.map((d: { path: string }) => d.path)).toContain("consent");
  });

  it("refuses an invalid email and an unknown interest", async () => {
    const res = await post({ ...valid, email: "not-an-email", interest: "vip" });
    expect(res.statusCode).toBe(400);
    const paths = res.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "interest"]));
  });

  it("accepts the trial interest the site offers", async () => {
    const res = await post({ ...valid, interest: "trial", slot: undefined });
    expect(res.statusCode).toBe(201);
    expect(store.leads[0]!.interest).toBe("trial");
  });

  it("refuses a slot that is not offered", async () => {
    const res = await post({ ...valid, slot: "Sunday night" });
    expect(res.statusCode).toBe(400);
  });

  it("rate-limits accepted requests per IP, and a mistyped form does not use up the allowance", async () => {
    for (let i = 0; i < 3; i++) await post({ ...valid, email: `user${i}@example.com`, interest: "demo" }, {}, "198.51.100.1");
    await post({ name: "" }, {}, "198.51.100.1");
    await post({ ...valid, email: "user9@example.com" }, {}, "198.51.100.1");
    await post({ ...valid, email: "user10@example.com" }, {}, "198.51.100.1");
    const blocked = await post({ ...valid, email: "user11@example.com" }, {}, "198.51.100.1");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    const otherIp = await post({ ...valid, email: "other@example.com" }, {}, "198.51.100.2");
    expect(otherIp.statusCode).toBe(201);
  });

  it("allows the site's origin in CORS and no other", async () => {
    const ok = await app.inject({ method: "OPTIONS", url: "/v1/public/leads", headers: { origin: SITE } });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(SITE);
    const other = await app.inject({ method: "OPTIONS", url: "/v1/public/leads", headers: { origin: "https://evil.example" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps the contract's interests and slots in step with the code", () => {
    expect([...INTERESTS].sort()).toEqual([...contract.fields.interest.values].sort());
    expect(contract.fields.slot.values.filter((v: string) => v !== "")).toEqual([...DEMO_SLOTS]);
  });
});
