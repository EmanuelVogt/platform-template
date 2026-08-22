import { InFlightGate } from "./in-flight-gate"

describe("InFlightGate", () => {
  it("admite até a capacidade e conta as vagas ocupadas", () => {
    const gate = new InFlightGate(2)
    expect(gate.inFlight).toBe(0)
    expect(gate.tryAcquire()).not.toBeNull()
    expect(gate.inFlight).toBe(1)
    expect(gate.tryAcquire()).not.toBeNull()
    expect(gate.inFlight).toBe(2)
  })

  it("recusa com null no teto, sem incrementar o contador", () => {
    const gate = new InFlightGate(1)
    gate.tryAcquire()
    expect(gate.tryAcquire()).toBeNull()
    expect(gate.inFlight).toBe(1)
  })

  it("liberar devolve a vaga e permite readquirir", () => {
    const gate = new InFlightGate(1)
    const release = gate.tryAcquire()
    expect(release).not.toBeNull()
    release?.()
    expect(gate.inFlight).toBe(0)
    expect(gate.tryAcquire()).not.toBeNull()
    expect(gate.inFlight).toBe(1)
  })

  it("liberar duas vezes não decrementa duas vezes", () => {
    const gate = new InFlightGate(2)
    const first = gate.tryAcquire()
    gate.tryAcquire()
    expect(gate.inFlight).toBe(2)
    first?.()
    first?.()
    expect(gate.inFlight).toBe(1)
  })

  it("release duplicado não abre vaga além da capacidade", () => {
    const gate = new InFlightGate(1)
    const release = gate.tryAcquire()
    release?.()
    release?.()
    expect(gate.tryAcquire()).not.toBeNull()
    expect(gate.tryAcquire()).toBeNull()
  })

  it("capacidade zero recusa desde a primeira aquisição", () => {
    const gate = new InFlightGate(0)
    expect(gate.tryAcquire()).toBeNull()
    expect(gate.inFlight).toBe(0)
  })
})
