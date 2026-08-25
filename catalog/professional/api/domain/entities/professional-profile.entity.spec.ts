import { describe, expect, it } from "vitest"

import { InvalidBirthDateError } from "../errors"

import { ProfessionalProfile } from "./professional-profile.entity"

const NOW = new Date("2026-08-25T12:00:00.000Z")

describe("ProfessionalProfile", () => {
  it("nasce sem atender cliente e sem data de nascimento", () => {
    const profile = ProfessionalProfile.create({ userId: "u1" }, NOW)

    expect(profile.props).toEqual({
      userId: "u1",
      servesClients: false,
      birthDate: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it("nasce atendendo cliente quando a criação pede", () => {
    const profile = ProfessionalProfile.create(
      { userId: "u1", servesClients: true },
      NOW
    )

    expect(profile.props.servesClients).toBe(true)
  })

  it("troca o atendimento a cliente numa instância nova, sem tocar a original", () => {
    const profile = ProfessionalProfile.create({ userId: "u1" }, NOW)
    const later = new Date("2026-08-26T09:30:00.000Z")

    const updated = profile.updateServesClients(true, later)

    expect(updated.props.servesClients).toBe(true)
    expect(updated.props.updatedAt).toEqual(later)
    expect(updated.props.createdAt).toEqual(NOW)
    expect(profile.props.servesClients).toBe(false)
  })

  it("grava uma data de nascimento real e passada", () => {
    const profile = ProfessionalProfile.create({ userId: "u1" }, NOW)
    const later = new Date("2026-08-26T09:30:00.000Z")

    const updated = profile.updateBirthDate("1990-02-28", later)

    expect(updated.props.birthDate).toBe("1990-02-28")
    expect(updated.props.updatedAt).toEqual(later)
  })

  it("recusa uma data que não existe no calendário e mantém o perfil", () => {
    const profile = ProfessionalProfile.create({ userId: "u1" }, NOW)

    expect(() => profile.updateBirthDate("2026-02-30", NOW)).toThrow(
      InvalidBirthDateError
    )
    expect(profile.props.birthDate).toBeNull()
  })

  it("recusa nascimento no futuro e acima do teto de 120 anos", () => {
    const profile = ProfessionalProfile.create({ userId: "u1" }, NOW)

    expect(() => profile.updateBirthDate("2026-08-26", NOW)).toThrow(
      InvalidBirthDateError
    )
    expect(() => profile.updateBirthDate("1900-01-01", NOW)).toThrow(
      InvalidBirthDateError
    )
    expect(profile.updateBirthDate("1910-01-01", NOW).props.birthDate).toBe(
      "1910-01-01"
    )
  })
})
