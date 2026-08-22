import { describe, expect, it } from "vitest"

import { Notification } from "./notification.entity"

const base = () =>
  Notification.create({
    recipientId: "u1",
    type: "password_changed",
    title: "Senha alterada",
    body: "corpo",
    actions: [],
    metadata: { at: "2026-06-10T00:00:00.000Z" },
    locale: "pt-BR",
  })

describe("Notification", () => {
  it("nasce não-vista, não-lida e não-arquivada, com ULID", () => {
    const n = base()
    expect(n.props.seenAt).toBeNull()
    expect(n.props.readAt).toBeNull()
    expect(n.props.archivedAt).toBeNull()
    expect(n.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it("markSeen retorna nova instância e preserva a original (freeze)", () => {
    const n = base()
    const at = new Date("2026-06-10T01:00:00Z")
    const seen = n.markSeen(at)
    expect(seen).not.toBe(n)
    expect(seen.props.seenAt).toBe(at)
    expect(n.props.seenAt).toBeNull()
    expect(Object.isFrozen(n.props)).toBe(true)
  })

  it("markSeen é no-op quando já vista (timestamp original preservado)", () => {
    const at1 = new Date("2026-06-10T01:00:00Z")
    const seen = base().markSeen(at1)
    expect(seen.markSeen(new Date("2026-06-10T02:00:00Z"))).toBe(seen)
  })

  it("markRead implica seen (item lido não conta no badge)", () => {
    const at = new Date("2026-06-10T01:00:00Z")
    const read = base().markRead(at)
    expect(read.props.readAt).toBe(at)
    expect(read.props.seenAt).toBe(at)
  })

  it("markRead é no-op quando já lida (timestamp original preservado)", () => {
    const read = base().markRead(new Date("2026-06-10T01:00:00Z"))
    expect(read.markRead(new Date("2026-06-10T02:00:00Z"))).toBe(read)
  })

  it("markRead preserva seenAt anterior", () => {
    const seenAt = new Date("2026-06-10T01:00:00Z")
    const readAt = new Date("2026-06-10T02:00:00Z")
    const n = base().markSeen(seenAt).markRead(readAt)
    expect(n.props.seenAt).toBe(seenAt)
    expect(n.props.readAt).toBe(readAt)
  })

  it("archive marca archivedAt sem mexer em read/seen; no-op se repetido", () => {
    const at = new Date("2026-06-10T03:00:00Z")
    const archived = base().archive(at)
    expect(archived.props.archivedAt).toBe(at)
    expect(archived.props.readAt).toBeNull()
    expect(archived.archive(new Date())).toBe(archived)
  })

  it("markSeen: segunda chamada retorna a mesma instância (branch no-op)", () => {
    const at1 = new Date("2026-06-11T08:00:00Z")
    const at2 = new Date("2026-06-11T09:00:00Z")
    const seen = base().markSeen(at1)
    const again = seen.markSeen(at2)
    expect(again).toBe(seen)
    expect(again.props.seenAt).toBe(at1)
  })

  it("markRead: segunda chamada retorna a mesma instância (branch no-op)", () => {
    const at1 = new Date("2026-06-11T08:00:00Z")
    const at2 = new Date("2026-06-11T09:00:00Z")
    const read = base().markRead(at1)
    const again = read.markRead(at2)
    expect(again).toBe(read)
    expect(again.props.readAt).toBe(at1)
  })

  it("archive: segunda chamada retorna a mesma instância (branch no-op)", () => {
    const at1 = new Date("2026-06-11T08:00:00Z")
    const at2 = new Date("2026-06-11T09:00:00Z")
    const archived = base().archive(at1)
    const again = archived.archive(at2)
    expect(again).toBe(archived)
    expect(again.props.archivedAt).toBe(at1)
  })

  it("markRead preenche seenAt com readAt quando notificação nunca foi vista (branch ?? at)", () => {
    const at = new Date("2026-06-11T10:00:00Z")
    const n = base()
    expect(n.props.seenAt).toBeNull()
    const read = n.markRead(at)
    expect(read.props.seenAt).toBe(at)
    expect(read.props.readAt).toBe(at)
  })
})
