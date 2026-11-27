import { describe, expect, it } from 'vitest'
import { fixOcrDigits, parseTicket } from './ticket'

describe('parseTicket', () => {
  it('supermercado con TOTAL, IVA, entregado y cambio', () => {
    const t = parseTicket(`MERCADONA, S.A.
C/ Mayor 12, Pamplona
NIF A46103834
FACTURA SIMPLIFICADA 2024-123-456789
12/03/2026 18:42  OP: 12345
1 LECHE ENTERA        0,95
2 PAN DE MOLDE   1,25  2,50
1 ACEITE OLIVA       8,99
TOTAL (€)           12,44
EFECTIVO            20,00
CAMBIO               7,56
IVA  BASE IMPONIBLE  CUOTA
10%      11,31       1,13`)
    expect(t.total).toBe(12.44)
    expect(t.totalConfidence).toBe('alta')
    expect(t.date).toBe('2026-03-12')
    expect(t.time).toBe('18:42')
    expect(t.merchant).toBe('MERCADONA, S.A.')
    expect(t.nif).toBe('A46103834')
  })

  it('importe en la línea siguiente y separador de miles', () => {
    const t = parseTicket(`Ferretería López
Fecha: 05-11-25
IMPORTE TOTAL
1.234,50 EUR`)
    expect(t.total).toBe(1234.5)
    expect(t.date).toBe('2025-11-05')
  })

  it('no confunde fecha con importe ni SUBTOTAL con total', () => {
    const t = parseTicket(`BAR EL RINCON
27.11.2026
CAFE 1,40
SUBTOTAL 5,60
TOTAL A PAGAR 6,16`)
    expect(t.total).toBe(6.16)
    expect(t.date).toBe('2026-11-27')
  })

  it('fecha con mes en texto', () => {
    expect(parseTicket('Fecha 3 de marzo de 2026\nTOTAL 4,00').date).toBe('2026-03-03')
    expect(parseTicket('15 ENE 26\nTOTAL 4,00').date).toBe('2026-01-15')
  })

  it('pago con tarjeta cuando no hay TOTAL', () => {
    const t = parseTicket('GASOLINERA REPSOL\n01/02/2026\nLITROS 30,12\nTARJETA VISA 45,30')
    expect(t.total).toBe(45.3)
    expect(t.totalConfidence).toBe('media')
  })

  it('sin palabras clave usa el mayor importe con confianza baja', () => {
    const t = parseTicket('TIENDA\n2,00\n3,50\nENTREGADO 10,00')
    expect(t.total).toBe(3.5)
    expect(t.totalConfidence).toBe('baja')
  })

  it('ignora porcentajes y fechas inválidas', () => {
    const t = parseTicket('TIENDA\n45/13/2026\nIVA 21,00 %\nTOTAL 9,99')
    expect(t.date).toBeNull()
    expect(t.amounts.map((a) => a.value)).toEqual([9.99])
  })
})

describe('fixOcrDigits', () => {
  it('corrige letras confundidas en cifras', () => {
    expect(fixOcrDigits('TOTAL 1O,5O')).toBe('TOTAL 10,50')
    expect(fixOcrDigits('TOTAL l2,S0')).toBe('TOTAL 12,50')
    expect(fixOcrDigits('TOTAL EUROS')).toBe('TOTAL EUROS')
  })
})

describe('comercio', () => {
  it('no descarta nombres que contienen PLAZA y salta líneas de dirección o cantidades', () => {
    expect(parseTicket('CAFETERIA LA PLAZA\nPlaza del Castillo 3\nTOTAL 5,17').merchant).toBe('CAFETERIA LA PLAZA')
    expect(parseTicket('Plaza Mayor 1\n2 CAFE 1,60\nTOTAL 3,20').merchant).toBeNull()
  })
})

describe('coma perdida por el OCR', () => {
  it('interpreta "IMPORTE TOTAL 517" como 5,17 con confianza media y lo prefiere a EFECTIVO', () => {
    const t = parseTicket('CAFETERIA\nSUBTOTAL 4,70\nIMPORTE TOTAL            517\nEFECTIVO 10,00\nCAMBIO 4,83')
    expect(t.total).toBe(5.17)
    expect(t.totalConfidence).toBe('media')
  })
})
