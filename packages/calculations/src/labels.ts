/**
 * Every user-facing string in this package lives here.
 *
 * Breakdown labels and warnings are shown to farmers, so they are Spanish
 * (spec §0.1). Keeping them in one module means the future i18n pass (out of
 * MVP, structure only) is a change to this file rather than a sweep through
 * five calculators. Identifiers, keys and code stay English.
 */
export const labels = {
  settlements: {
    perDelivery: (i: number) => `Entrega ${i}`,
    kgOlives: 'Aceituna entregada (kg)',
    industrialYield: 'Rendimiento industrial',
    kgOil: 'Aceite obtenido (kg)',
    gross: 'Importe bruto',
    costs: 'Costes de almazara',
    totalKgOlives: 'Total de aceituna entregada (kg)',
    totalKgOil: 'Total de aceite obtenido (kg)',
    litersOilTotal: 'Total de aceite obtenido (L)',
    avgYield: 'Rendimiento industrial medio',
    taxableBase: 'Base imponible',
    vatReagp: 'Compensación REAGP',
    vatGeneral: 'IVA régimen general',
    vatNone: 'Sin IVA',
    withholdingBase: 'Base de retención',
    withholding: 'Retención de IRPF',
    withdrawn: 'Aceite retirado',
    netToReceive: 'Neto a percibir',
    effectivePrice: 'Precio efectivo por kg de aceituna',
  },
  yieldConverter: {
    industrialYield: 'Rendimiento industrial',
    fatYieldDry: 'Rendimiento graso sobre seco',
    kgOil: 'Aceite obtenido (kg)',
    litersOil: 'Aceite obtenido (L)',
    kgOlivesPerKgOil: 'kg de aceituna por kg de aceite',
    kgOlivesPerLiter: 'kg de aceituna por litro de aceite',
    inverseKgOlives: 'Aceituna necesaria (kg)',
    inverseLiters: 'Aceite necesario (L)',
  },
  costPerHectare: {
    totalCostPerHa: 'Coste total por hectárea',
    totalCost: 'Coste total',
    kgOilPerHa: 'Aceite producido por hectárea (kg)',
    revenuePerHa: 'Ingresos por hectárea',
    subsidies: 'Subvenciones por hectárea',
    marginPerHa: 'Margen por hectárea',
    costPerKgOlive: 'Coste por kg de aceituna',
    costPerKgOil: 'Coste por kg de aceite',
    breakEven: 'Precio de aceite de equilibrio',
  },
  harvestCrew: {
    dailyWage: 'Jornal diario',
    wagesTotal: 'Coste de jornales',
    employerCost: 'Sobrecoste empresarial',
    opsTotal: 'Maquinaria y transporte',
    total: 'Coste total de la cuadrilla',
    kgHarvested: 'Aceituna recogida (kg)',
    costPerKgOlive: 'Coste por kg de aceituna',
  },
  units: {
    eurosPerDay: '€/día',
  },
  harvestType: {
    tree: 'vuelo',
    ground: 'suelo',
  },
  costLines: {
    pruning: 'Poda',
    fertilization: 'Fertilización',
    phytosanitary: 'Fitorosanidad',
    irrigation: 'Riego',
    harvest: 'Recogida',
    soilManagement: 'Manejo del suelo',
    machinery: 'Maquinaria',
    insurance: 'Seguros',
    coopFees: 'Cuotas de cooperativa',
    other: 'Otros',
    depreciation: 'Depreciación',
  },
} as const;

export const warnings = {
  lowFatYield: 'El rendimiento graso total está por debajo del 10 %. Revisa el análisis.',
  highFatYield: 'El rendimiento graso total está por encima del 30 %. Es inusualmente alto.',
  highCorrectionIndex: 'El índice corrector es alto para un rendimiento graso así.',
  negativeSettlement: 'El aceite retirado supera el valor liquidado.',
  unverifiedParams: 'Este cálculo usa valores pendientes de verificación.',
  zeroIndustrialYield:
    'El rendimiento industrial es 0, no se puede calcular el rendimiento inverso.',
  crewEstimate:
    'Estimación orientativa; las cotizaciones reales del Sistema Especial Agrario dependen de cada contrato. Consulta con tu gestoría.',
} as const;
