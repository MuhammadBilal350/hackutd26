export type FinanceInputs = {
  currentValue: number;
  currentRepairsMonthly: number;
  currentMaintenanceYearly: number;
  currentResaleAfterTenYears: number;

  newVehiclePrice: number;
  downPayment: number;
  apr: number;
  loanTermMonths: number;
  newMaintenanceYearly: number;
  newResaleAfterTenYears: number;

  leaseMonthlyPayment: number;
  leaseTermMonths: number;
  leaseDueAtSigning: number;
};

export function calculateLoanPayment(
  principal: number,
  apr: number,
  months: number
) {
  if (
    !Number.isFinite(principal) ||
    !Number.isFinite(apr) ||
    !Number.isFinite(months) ||
    principal <= 0 ||
    months <= 0
  ) {
    return 0;
  }

  const monthlyRate = Math.max(0, apr) / 100 / 12;
  const termMonths = Math.max(1, Math.floor(months));

  if (monthlyRate === 0) {
    return principal / termMonths;
  }

  return (
    (principal * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -termMonths))
  );
}

export function calculateComparison(input: FinanceInputs) {
  const loanPrincipal = Math.max(
    0,
    input.newVehiclePrice - input.downPayment
  );
  const loanTermMonths =
    Number.isFinite(input.loanTermMonths) && input.loanTermMonths > 0
      ? Math.max(1, Math.floor(input.loanTermMonths))
      : 60;

  const monthlyPayment = calculateLoanPayment(
    loanPrincipal,
    input.apr,
    loanTermMonths
  );

  const totalLoanPayments = monthlyPayment * loanTermMonths;
  const monthsPaidInTenYears = Math.min(120, loanTermMonths);
  const loanPaymentsInTenYears = monthlyPayment * monthsPaidInTenYears;
  const monthlyRate = Math.max(0, input.apr) / 100 / 12;
  const remainingLoanBalance =
    monthlyRate === 0
      ? Math.max(
          0,
          loanPrincipal - loanPaymentsInTenYears
        )
      : Math.max(
          0,
          loanPrincipal * Math.pow(1 + monthlyRate, monthsPaidInTenYears) -
            monthlyPayment *
              ((Math.pow(1 + monthlyRate, monthsPaidInTenYears) - 1) /
                monthlyRate)
        );

  // Ten-year economic cost estimates.
  // These are simplified estimates, not dealer quotes.

  const keepRepairs =
    input.currentRepairsMonthly * 120;

  const keepMaintenance =
    input.currentMaintenanceYearly * 10;

  const keepDepreciation = Math.max(
    0,
    input.currentValue - input.currentResaleAfterTenYears
  );

  const keepTotal =
    keepRepairs +
    keepMaintenance +
    keepDepreciation;

  const replacementMaintenance =
    input.newMaintenanceYearly * 10;

  const replacementTotal =
    input.downPayment +
    loanPaymentsInTenYears +
    remainingLoanBalance +
    replacementMaintenance -
    input.newResaleAfterTenYears;

  const leaseMonths = 120;
  const leaseTermMonths =
    Number.isFinite(input.leaseTermMonths) && input.leaseTermMonths > 0
      ? Math.max(1, Math.floor(input.leaseTermMonths))
      : 36;
  const leaseContracts = Math.ceil(leaseMonths / leaseTermMonths);
  const leaseTotal =
    Math.max(0, input.leaseMonthlyPayment) * leaseMonths +
    Math.max(0, input.leaseDueAtSigning) * leaseContracts +
    replacementMaintenance;
  const alternatives = [
    { name: "keeping", cost: keepTotal },
    { name: "buying", cost: replacementTotal },
    { name: "leasing", cost: leaseTotal },
  ];
  const lowestCost = alternatives.reduce((lowest, option) =>
    option.cost < lowest.cost ? option : lowest
  );
  const difference = keepTotal - replacementTotal;

  return {
    monthlyPayment,
    loanPrincipal,
    totalLoanPayments,
    loanPaymentsInTenYears,
    remainingLoanBalance,
    keepTotal: Math.max(0, keepTotal),
    replacementTotal: Math.max(0, replacementTotal),
    leaseTotal: Math.max(0, leaseTotal),
    difference,
    lowestCost: lowestCost.name,
    recommendation: `Based on the inputs, ${lowestCost.name} has the lowest estimated 10-year cost. This is a comparison, not a recommendation to buy.`,
  };
}

export function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}