/* Calculator engines: the ERP's four design calculators, used by the Calculators app (app-tools.js).
     gas      ERP/chlorination_calculator.html
     clo2     ERP/clo2_calculator.js
     electro  ERP/electrochlorinator_calculator.js
     batch    ERP/batch_electrochlorinator_calculator.js
   The formula code is the ERP's own, copied unchanged. The only edits: inputs are read from a plain
   values object (CUR) instead of DOM fields, and calculate() returns its result cards and BOQ instead
   of drawing them. Each engine gives
     sections(values, toolSettings) -> input form sections [{ group, title, internal, hidden, fields | blocks }]
     compute(values)                -> { groups: [{ title, cards }], boq: [{ area, scopeKey, items }], headline, capacity, warn } or { error } */

const CALC_REMARK = 'All calculations are based on input data provided.\nDesign is subject to final verification during detailed engineering.';
const BOQ_SCOPE_OPTS = [{ value: 'RSVP', label: 'RSVP Scope' }, { value: 'CLIENT', label: 'Client Scope' }];

/* ============================== Gas chlorinator ============================== */
const GAS_ENGINE = (() => {
  let CUR = {};
  function getInputValue(id) { const value = parseFloat(CUR[id]); return isNaN(value) ? 0 : value; }
  function getInputValueOrDefault(id, defaultValue) {
    if (CUR[id] == null || CUR[id] === '') return defaultValue;
    const value = parseFloat(CUR[id]);
    return isNaN(value) ? defaultValue : value;
  }
  function getText(id) { return CUR[id] == null ? '' : String(CUR[id]); }
  function F(id, label, unit, value, type, opts) { return { id, label, unit: unit || '', value, type: type || 'num', opts }; }
  const card = (label, value, unit, flag, internal) => ({ label, value, unit: unit || '', flag, internal: Boolean(internal) });

  const DEFAULT_CONSTANTS = {
    molecularWeight: 70.9,
    ambientTemp: 30,
    pressureGauge: -0.5,
    pgGasLine: 9,
    tempGasLine: 30,
  };
  function convertFlowRateToM3Hr(value, unit) {
    if (unit === "mld") return (value * 1000) / 24;
    if (unit === "ltrhr") return value / 1000;
    return value;
  }
  function getFlowRateM3Hr() { return convertFlowRateToM3Hr(getInputValue('flowRateM3'), getText('flowRateUnit') || 'm3hr'); }

  function roundUpToQuarter(value) {
    const decimal = value - Math.floor(value);
    if (decimal === 0) return value;
    if (decimal <= 0.25) return Math.floor(value) + 0.25;
    if (decimal <= 0.5) return Math.floor(value) + 0.5;
    if (decimal <= 0.75) return Math.floor(value) + 0.75;
    return Math.ceil(value);
  }

  function roundSystemCapacity(value) {
    if (value <= 0) return 0;
    if (value <= 1) return 1;
    if (value <= 2) return 2;
    return Math.ceil(value / 5) * 5;
  }

  function calculateFrictionFactor(reynoldsNumber, relativeRoughness) {
    const f4000 =
      0.25 /
      Math.pow(
        Math.log10(
          relativeRoughness / 3.7 +
            5.74 / Math.pow(4000, 0.9) -
            (5.74 / Math.pow(4000, 0.9) - 6.09 / Math.pow(4000, 1.1109)) /
              (1 + 0.0002 * Math.pow(4000 * relativeRoughness, 1.5)),
        ),
        2,
      );

    if (reynoldsNumber < 2000) {
      return 64 / reynoldsNumber;
    } else if (reynoldsNumber >= 2000 && reynoldsNumber <= 4000) {
      return (
        64 / 2000 + ((reynoldsNumber - 2000) * (f4000 - 64 / 2000)) / 2000
      );
    } else {
      return (
        0.25 /
        Math.pow(
          Math.log10(
            relativeRoughness / 3.7 +
              5.74 / Math.pow(reynoldsNumber, 0.9) -
              (5.74 / Math.pow(reynoldsNumber, 0.9) -
                6.09 / Math.pow(reynoldsNumber, 1.1109)) /
                (1 +
                  0.0002 *
                    Math.pow(reynoldsNumber * relativeRoughness, 1.5)),
          ),
          2,
        )
      );
    }
  }

  function findLargestDivisor(num) {
    if (!Number.isFinite(num)) return 1;
    const sqrt = Math.sqrt(num);
    for (let i = Math.floor(sqrt); i >= 1; i--) {
      if (num % i === 0) {
        return i;
      }
    }
    return 1;
  }

  function calculate() {
    try {
      // Clear errors

      // Get basic inputs
      const workingTime = getInputValue("workingTime");
      const flowRateM3 = getFlowRateM3Hr();
      const manualSystemCapacity = getInputValue("systemCapacityInput");
      const manualTonnerRequirement = getInputValue(
        "tonnerRequirementInput",
      );
      const manualCylinderRequirement = getInputValue(
        "cylinderRequirementInput",
      );
      const mountingType =
        getText("mountingType") || "floor";
      const containerType =
        getText("containerType") || "tonner";
      const noOfDosingPoints =
        parseInt(getText("noOfDosingPoints")) || 1;
      const workingSystem = getInputValue("workingSystem");

      const standbySystem = getInputValue("standbySystem");

      const totalSystem = workingSystem + standbySystem;

      const csGasLineLength = getInputValue("csGasLineLength");

      const upvcGasLineLength = getInputValue("upvcGasLineLength");

      const solutionLineClientScope = getInputValue(
        "solutionLineClientScope",
      );
      const molecularWeight = getInputValueOrDefault(
        "molecularWeight",
        DEFAULT_CONSTANTS.molecularWeight,
      );
      const ambientTemp = getInputValueOrDefault(
        "ambientTemp",
        DEFAULT_CONSTANTS.ambientTemp,
      );
      const pressureGauge = getInputValueOrDefault(
        "pressureGauge",
        DEFAULT_CONSTANTS.pressureGauge,
      );
      const pgGasLine = getInputValueOrDefault(
        "pgGasLine",
        DEFAULT_CONSTANTS.pgGasLine,
      );
      const tempGasLine = getInputValueOrDefault(
        "tempGasLine",
        DEFAULT_CONSTANTS.tempGasLine,
      );

      // Validation
      if (workingTime <= 0) {
        throw new Error("Working Time must be greater than 0");
      }
      if (flowRateM3 === 0 && manualSystemCapacity === 0) {
        throw new Error(
          "Either Flow Rate or System Capacity must be filled",
        );
      }

      // Calculate Required Chlorine and Chlorination Capacity for each dosing point
      let chlorinationCapacities = [];
      let requiredChlorines = [];
      let hSubmergenceValues = [];

      for (let i = 1; i <= noOfDosingPoints; i++) {
        const dosage = getInputValue(`dosage_${i}`);
        const demand = getInputValue(`demand_${i}`);
        const residual = getInputValue(`residual_${i}`);
        const hSubmergence = getInputValue(`hSubmergence_${i}`);

        let requiredChlorine = 0;

        if (dosage > 0) {
          requiredChlorine = flowRateM3 * dosage;
        } else if (demand > 0 || residual > 0) {
          requiredChlorine = flowRateM3 * (demand + residual);
        }

        if (requiredChlorine <= 0 && manualSystemCapacity > 0) {
          requiredChlorine =
            (manualSystemCapacity * 125 * workingTime) /
            (3 * noOfDosingPoints);
        }

        requiredChlorines.push(requiredChlorine);
        hSubmergenceValues.push(hSubmergence);
        const chlorinationCapacity =
          (requiredChlorine * 3) / 125 / workingTime;
        chlorinationCapacities.push(chlorinationCapacity);
      }

      // System Capacity (1, 2, then multiples of 5)
      const sumCapacity = chlorinationCapacities.reduce((a, b) => a + b, 0);
      const calculatedSystemCapacity = roundSystemCapacity(sumCapacity);
      const systemCapacity =
        manualSystemCapacity > 0
          ? manualSystemCapacity
          : calculatedSystemCapacity;

      // Motive Water Flow Rate
      const motiveWaterFlowRate = systemCapacity / 2;

      // Chlorine demand for Tonner/Cylinder sizing only: (ppm * flow m3/hr) / 1000
      let containerChlorineDemand = 0;
      for (let i = 1; i <= noOfDosingPoints; i++) {
        const dosage = getInputValue(`dosage_${i}`);
        const demand = getInputValue(`demand_${i}`);
        const residual = getInputValue(`residual_${i}`);
        const ppm = dosage > 0 ? dosage : demand + residual;
        containerChlorineDemand += (ppm * flowRateM3) / 1000;
      }
      const containerSystemCapacity =
        containerChlorineDemand > 0
          ? containerChlorineDemand
          : systemCapacity;

      // Tonner Requirement (1 tonner = 900 kg)
      const calculatedTonnerRequirement = Math.ceil(
        (containerSystemCapacity * workingTime) / 900,
      );
      const tonnerRequirement =
        manualTonnerRequirement > 0
          ? manualTonnerRequirement
          : calculatedTonnerRequirement;

      // Cylinder Requirement (1 cylinder = 100 kg)
      const calculatedCylinderRequirement = Math.ceil(
        (containerSystemCapacity * workingTime) / 100,
      );
      const cylinderRequirement =
        manualCylinderRequirement > 0
          ? manualCylinderRequirement
          : calculatedCylinderRequirement;

      // Vacuum gas flow rate
      const vacuumGasFlowRate =
        (0.08314 * (ambientTemp + 273.15) * systemCapacity) /
        ((pressureGauge + 1.013) * molecularWeight);

      // Velocity inputs
      let velocityVacuum = getInputValue("velocityVacuum");
      let velocityGas = getInputValue("velocityGas");
      let velocitySuction = getInputValue("velocitySuction");
      let velocityDischarge = getInputValue("velocityDischarge");
      let velocitySolution = getInputValue("velocitySolution");

      // Calculate default velocities if not provided
      if (velocityGas <= 0) {
        velocityGas = velocityVacuum > 0 ? velocityVacuum : 1;
      }
      if (velocityVacuum <= 0) {
        velocityVacuum = velocityGas > 0 ? velocityGas : 1;
      }
      if (velocitySuction === 0) {
        velocitySuction = 0.95 * Math.pow(motiveWaterFlowRate, 0.45);
      }
      if (velocityDischarge === 0) {
        velocityDischarge = 0.95 * Math.pow(motiveWaterFlowRate, 0.45);
      }
      if (velocitySolution === 0) {
        velocitySolution = 0.95 * Math.pow(systemCapacity / 2, 0.45);
      }

      // Line Sizes
      const vacuumLineSize = roundUpToQuarter(
        Math.sqrt(vacuumGasFlowRate / (velocityVacuum * 2826)) * 39.37,
      );
      const gasLineSize =
        39.37 *
        Math.sqrt(
          (4 * systemCapacity * 0.08314 * (tempGasLine + 303.15)) /
            (3.14 *
              molecularWeight *
              3600 *
              (pgGasLine + 1.013) *
              velocityGas),
        );
      const suctionLineSize = roundUpToQuarter(
        Math.sqrt(motiveWaterFlowRate / (velocitySuction * 2826)) * 39.37,
      );
      const dischargeLineSize = roundUpToQuarter(
        Math.sqrt(motiveWaterFlowRate / (velocityDischarge * 2826)) * 39.37,
      );

      // Suction Line Calculations
      const reynoldsSuction =
        (25400 * motiveWaterFlowRate) / (1.8232 * suctionLineSize);
      const relativeRoughnessSuction =
        getInputValue("roughnessSuction") / (suctionLineSize * 25.4);
      const frictionFactorSuction = calculateFrictionFactor(
        reynoldsSuction,
        relativeRoughnessSuction,
      );

      // K suction
      const kSuction =
        getInputValue("elbow90Suction") * 0.9 +
        getInputValue("elbow45Suction") * 0.35 +
        getInputValue("elbowLRSuction") * 0.25 +
        getInputValue("teeStraightSuction") * 0.6 +
        getInputValue("teeBranchSuction") * 1.9 +
        getInputValue("gateValveSuction") * 0.175 +
        getInputValue("ballValveSuction") * 0.075 +
        getInputValue("manifoldValveSuction") * 1.5 +
        getInputValue("globeValveSuction") * 9 +
        getInputValue("swingCheckSuction") * 2.25 +
        getInputValue("butterflyValveSuction") * 0.85 +
        getInputValue("diaphragmValveSuction") * 2.75 +
        getInputValue("nrvSuction") * 2.5 +
        getInputValue("flowmeterSuction") * 3 +
        getInputValue("unionSuction") * 0.09 +
        getInputValue("connectorSuction") * 0.4 +
        getInputValue("couplingSuction") * 0.06 +
        getInputValue("reducerSuction") * 0.75 +
        getInputValue("reducerTaperedSuction") * 0.15;

      // Suction NPSH Available
      const suctionNPSH =
        10.09 +
        10.19368 * getInputValue("pSuction") +
        getInputValue("zSuctionSurface") -
        getInputValue("zSuctionCenterline") -
        (frictionFactorSuction *
          getInputValue("lengthSuction") *
          motiveWaterFlowRate) /
          (0.90869 * Math.pow(suctionLineSize, 3)) +
        (kSuction * motiveWaterFlowRate) /
          (35.7752 * Math.pow(suctionLineSize, 2));

      // Discharge Line Calculations
      const reynoldsDischarge =
        (25400 * motiveWaterFlowRate) / (1.8232 * dischargeLineSize);
      const relativeRoughnessDischarge =
        getInputValue("roughnessDischarge") / (dischargeLineSize * 25.4);
      const frictionFactorDischarge = calculateFrictionFactor(
        reynoldsDischarge,
        relativeRoughnessDischarge,
      );

      // K discharge
      const kDischarge =
        getInputValue("elbow90Discharge") * 0.9 +
        getInputValue("elbow45Discharge") * 0.35 +
        getInputValue("elbowLRDischarge") * 0.25 +
        getInputValue("teeStraightDischarge") * 0.6 +
        getInputValue("teeBranchDischarge") * 1.9 +
        getInputValue("gateValveDischarge") * 0.175 +
        getInputValue("ballValveDischarge") * 0.075 +
        getInputValue("manifoldValveDischarge") * 1.5 +
        getInputValue("globeValveDischarge") * 9 +
        getInputValue("swingCheckDischarge") * 2.25 +
        getInputValue("butterflyValveDischarge") * 0.85 +
        getInputValue("diaphragmValveDischarge") * 2.75 +
        getInputValue("nrvDischarge") * 2.5 +
        getInputValue("flowmeterDischarge") * 3 +
        getInputValue("unionDischarge") * 0.09 +
        getInputValue("connectorDischarge") * 0.4 +
        getInputValue("couplingDischarge") * 0.06 +
        getInputValue("reducerDischarge") * 0.75 +
        getInputValue("reducerTaperedDischarge") * 0.15;

      // Residual Dynamic Head
      const residualDynamicHead =
        10 *
        ((frictionFactorDischarge *
          getInputValue("lengthDischarge") *
          motiveWaterFlowRate) /
          (0.90869 * dischargeLineSize) +
          (kDischarge * motiveWaterFlowRate) /
            (35.7752 * Math.pow(dischargeLineSize, 2)) +
          10.19368 * getInputValue("pDischarge") +
          getInputValue("zDischargeSurface") -
          getInputValue("zDischargeCenterline"));
      const hSubmergence = Math.max(...hSubmergenceValues, 0);
      const totalDynamicHead = residualDynamicHead + hSubmergence;

      // Injector Nozzle Size
      const pInjectorLoss = getInputValue("pInjectorLoss");
      const injectorNozzleSize = Math.sqrt(
        (57.07 * motiveWaterFlowRate) /
          Math.sqrt(2 * (pInjectorLoss - pressureGauge)),
      );

      // Solution Line Size
      const solutionLineSize = roundUpToQuarter(
        39.37 * Math.sqrt(systemCapacity / (5652 * velocitySolution)),
      );

      const OUT = [{
        title: 'Calculation Results',
        cards: [
          card('System Capacity', systemCapacity.toFixed(2), 'kg/hr', 'hl'),
          card('Motive Water Flow Rate', motiveWaterFlowRate.toFixed(2), 'm³/hr'),
          containerType === 'cylinder'
            ? card('Cylinder Requirement (100 kg each)', cylinderRequirement, 'nos', 'hl')
            : card('Tonner Requirement (900 kg each)', tonnerRequirement, 'nos', 'hl'),
          card('Vacuum Gas Flow Rate', vacuumGasFlowRate.toFixed(4), 'm³/hr'),
          card('Gas Line Size', gasLineSize.toFixed(2), 'inch'),
          card('Vacuum Line Size', vacuumLineSize.toFixed(2), 'inch'),
          card('Suction Water Line Size', suctionLineSize.toFixed(2), 'inch'),
          card('Discharge Water Line Size', dischargeLineSize.toFixed(2), 'inch'),
          card('Suction NPSH Available', suctionNPSH.toFixed(4), 'm'),
          card('Total Dynamic Head', totalDynamicHead.toFixed(4), 'm'),
          card('Injector Nozzle Size', injectorNozzleSize.toFixed(4), 'mm'),
          card('Solution Line Size', solutionLineSize.toFixed(2), 'inch'),
        ],
      }];

      // Diffuser results, one group per dosing point (displayDiffuserResults in the ERP page)
      for (let i = 1; i <= noOfDosingPoints; i++) {
        const solutionStrength = getInputValue(`solutionStrength_${i}`);
        const velocityDiffuser = getInputValue(`velocityDiffuser_${i}`);
        const velocityDiffuserHole = getInputValue(
          `velocityDiffuserHole_${i}`,
        );
        const diameterHole = getInputValue(`diameterHole_${i}`);
        const ccSpacingLength = getInputValue(`ccSpacingLength_${i}`);
        const marginSpace = getInputValue(`marginSpace_${i}`);

        // Diffuser Flow Rate
        const diffuserFlowRate =
          (24000 * requiredChlorines[i - 1]) /
          (workingTime * solutionStrength);

        // Diffuser Line Size
        const diffuserLineSize =
          39.37 *
          Math.sqrt(
            (4 * diffuserFlowRate) / (3.14 * 3600000 * velocityDiffuser),
          );

        // Qrate
        let qrate;
        if (noOfDosingPoints <= 1) {
          qrate = motiveWaterFlowRate / 3600;
        } else {
          qrate = diffuserFlowRate / 3600000;
        }

        // No of Holes
        const diameterHoleM = diameterHole / 1000;

        const noOfHoles = Math.round(
          qrate /
            velocityDiffuserHole /
            ((Math.PI * Math.pow(diameterHoleM, 2)) / 4),
        );

        // No of Lines

        const adjustedNoOfHoles =
          noOfHoles % 2 !== 0 ? noOfHoles + 1 : noOfHoles;

        // No of Lines
        const noOfLines = findLargestDivisor(adjustedNoOfHoles);

        // No of Holes per Line
        const noOfHolesPerLine = noOfHoles / noOfLines;

        // Pipe Diameter
        let pipeDiameter;
        if (noOfDosingPoints > 1) {
          pipeDiameter = diffuserLineSize;
        } else {
          pipeDiameter = solutionLineSize * 0.0254;
        }

        // C-C Spacing Along Circumference
        const ccSpacingCircumference = (3.14 * pipeDiameter) / noOfLines;

        // Diffuser Length
        const diffuserLength =
          (noOfHolesPerLine - 1) * ccSpacingLength + 2 * marginSpace;
        OUT.push({
          title: `Diffuser Point ${i}`,
          cards: [
            card('Diffuser Flow Rate', diffuserFlowRate.toFixed(4), 'L/hr'),
            card('Diffuser Line Size', diffuserLineSize.toFixed(4), 'inch'),
            card('No of Holes', noOfHoles, 'Nos'),
            card('No of Lines', noOfLines, 'Nos'),
            card('No of Holes per Line', noOfHolesPerLine.toFixed(0), 'Nos'),
            card('C-C Spacing along Length', ccSpacingLength.toFixed(2), 'mm'),
            card('Margin Space on Both Sides', marginSpace.toFixed(2), 'mm'),
            card('C-C Spacing Along Circumference', ccSpacingCircumference.toFixed(4), 'm'),
            card('Diffuser Length', diffuserLength.toFixed(2), 'mm'),
          ],
        });
      }

      const BOQ = generateBOQDataV2({
        tonnerRequirement,
        cylinderRequirement,
        mountingType,
        containerType,

        totalSystem,

        noOfDosingPoints,
        workingTime,
        systemCapacity,
        gasLineSize,
        vacuumLineSize,
        suctionLineSize,
        dischargeLineSize,
        solutionLineSize,
        diffuserLineSizes: Array.from(
          { length: noOfDosingPoints },
          (_, index) => getInputValue(`diffuserLineSize_${index + 1}`),
        ),
        diffuserPipeLengths: Array.from(
          { length: noOfDosingPoints },
          (_, index) => getInputValue(`diffuserPipeLength_${index + 1}`),
        ),

        csGasLineLength,

        upvcGasLineLength,

        solutionLineClientScope,

        lengthDischarge: getInputValue("lengthDischarge"),
      });
      return {
        groups: OUT,
        boq: BOQ,
        capacity: systemCapacity,
        headline: `${systemCapacity.toFixed(2)} kg/hr chlorinator · ${containerType === 'cylinder' ? `${cylinderRequirement} cylinder(s) of 100 kg` : `${tonnerRequirement} tonner(s) of 900 kg`}`,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  function generatePedestalBOQData({
    tonnerRequirement,
    cylinderRequirement,
    containerType,
    totalSystem,
    row,
  }) {
    const isCylinder = containerType === "cylinder";
    const containerQty = isCylinder ? cylinderRequirement : tonnerRequirement;
    const ws = totalSystem;

    const sections = [
      {
        area: "1. CHLORINE GAS SUPPLY & CONTROL",
        items: [
          [
            isCylinder ? "Cylinder" : "Tonner",
            isCylinder ? "100 kg" : "900 kg",
            "PESO Approved",
            containerQty,
            "No",
          ],
          !isCylinder && [
            "Tonner Roller Support",
            "With rail arrangement, MS",
            "MS",
            tonnerRequirement,
            "Set",
          ],
          [
            "Vacuum Regulator",
            `${isCylinder ? "Cylinder" : "Tonner"} mounted; automatic vacuum shut-off; chlorine service`,
            "CS-PTFE",
            ws,
            "No",
          ],
          [
            "Chlorine Gas Filter",
            "Fine particulate filter suitable for dry chlorine gas; corrosion-resistant internals",
            "CS",
            ws,
            "No",
          ],
          [
            "Pressure Gauge",
            "Chlorine service, diaphragm protected, suitable range",
            "SS316-Monel",
            ws,
            "No",
          ],
          [
            "Manual Chlorine Isolation Valve",
            "Chlorine compatible; Monel/Hastelloy wetted parts as applicable",
            "Monel/Hastelloy",
            containerQty,
            "No",
          ],
          [
            "Flexible Chlorine Connector",
            "Seamless copper flexible connection suitable for chlorine service",
            "Seamless copper",
            containerQty,
            "Set",
          ],
          !isCylinder && [
            "Additional Ton Valve With Yoke",
            "Monel",
            "Monel",
            tonnerRequirement,
            "No",
          ],
          [
            "Half Hood",
            "FRP",
            "FRP",
            containerQty,
            "No",
          ],
          [
            "Chlorine Header / Manifold",
            `For connecting required number of chlorine ${isCylinder ? "cylinders" : "tonners"}`,
            "CS/Monel",
            1,
            "Set",
          ],
          [
            "Pressure Relief Valve",
            "Suitable for chlorine gas system",
            "SS316/Monel",
            ws,
            "Set",
          ],
        ].filter(Boolean),
      },
      {
        area: "2. PEDESTAL MOUNTED CHLORINATOR ASSEMBLY",
        items: [
          ["Chlorinator Pedestal", "Floor-mounted rigid pedestal/frame", "MS-FRP", ws, "No"],
          ["Chlorine Gas Flow Meter / Rotameter", "Direct reading in kg/hr chlorine", "Borosilicate Glass-PTFE", ws, "No"],
          ["Chlorine Gas Flow Control Valve", "Fine needle/control valve suitable for dry chlorine under vacuum", "SS316/PTFE", ws, "No"],
          ["Differential Pressure Regulator", "Maintains constant differential pressure across flow control section", "PVC/PTFE", ws, "No"],
          ["Vacuum Gauge", "Indicates chlorinator vacuum condition", "SS316/PTFE", ws, "No"],
          ["Vacuum Relief Valve", "Protects chlorinator from excessive vacuum", "PVC/PTFE", ws, "No"],
          ["Manual Isolation Valve", "Close chlorine supply on loss of injector vacuum", "PVC/PTFE", ws, "Set"],
          ["Chlorine Gas Tubing", "PE/PVC/approved vacuum chlorine tubing", "PE/PVC", 1, "Lot"],
          ["Tube Fittings & Connectors", "Chlorine-resistant fittings, unions and adaptors", "PVC/PTFE", 1, "Lot"],
        ],
      },
      {
        area: "3. INJECTOR / EJECTOR SYSTEM",
        items: [
          ["Chlorine Gas Injector / Ejector", "Suitable for maximum chlorine capacity and available motive-water pressure", "PVC/CPVC/PTFE", ws, "No"],
          ["Injector Check Valve", "Prevents motive water entering chlorine gas line", "PVC/PTFE", ws, "No"],
          ["Injector Isolation Valve", "PVC/UPVC/CPVC as suitable for water service", "UPVC/CPVC/PVC", ws * 2, "Nos"],
          ["Motive Water Pressure Gauge", "Suitable pressure range", "SS316-Brass", ws, "No"],
          ["Motive Water Strainer", "Y-strainer, suitable for available water quality", "SS304/SS316", ws, "No"],
          ["Motive Water Booster Pump", "Centrifugal pump sized for injector flow and pressure requirement", "CI-SS316", ws, "No"],
          ["Booster Pump Base Frame", "MS epoxy-coated / suitable construction", "MS", ws, "Set"],
        ],
      },
      {
        area: "4. CHLORINE SOLUTION LINE",
        items: [
          ["Chlorinated Water Solution Piping", "UPVC/CPVC/PVC suitable for chlorine solution", "UPVC/CPVC/PVC", 1, "Lot"],
          ["Solution Isolation Valve", "UPVC/CPVC ball valve", "UPVC/CPVC", ws, "No"],
          ["Non-Return Valve", "Chlorinated water service", "UPVC/CPVC", ws, "No"],
          ["Chlorine Solution Diffuser", "PVC/CPVC/FRP suitable for installation at dosing point", "PVC-FRP/CPVC-FRP", ws, "No"],
        ],
      },
      {
        area: "5. CHLORINE GAS SAFETY SYSTEM",
        items: [
          ["Chlorine Gas Leak Detector", "Electrochemical chlorine sensor", "ABS/Polycarbonate", 1, "No"],
          ["Local Chlorine Leak Alarm", "Audible and visual alarm", "ABS/Polycarbonate", 1, "Set"],
        ],
      },
      {
        area: "6. ELECTRICAL / CONTROL",
        items: [
          ["Local Control Panel", "Powder-coated enclosure complete with MCB/MCCB, contactors, relays, indication lamps", "CRCA-MS", 1, "No"],
          ["Instrument Power Supply", "230 VAC / 24 VDC as required", "", 1, "Set"],
          ["Control & Power Cables", "Including termination accessories", "", 1, "Lot"],
          ["Cable Glands & Lugs", "Suitable for installation", "", 1, "Lot"],
        ],
      },
      {
        area: "7. PEDESTAL / SUPPORT / ACCESSORIES",
        items: [
          ["Foundation Fasteners", "SS304/SS316 anchor bolts", "SS304/SS316", 1, "Set"],
          ["Interconnecting Hardware", "Nuts, bolts, washers, clamps, miscellaneous fittings", "SS304/SS316", 1, "Lot"],
        ],
      },
    ];

    let slNo = 0;
    return sections.map((section) => ({
      area: section.area,
      items: section.items.map(([item, specification, moc, qty, unit]) => {
        slNo += 1;
        return row(slNo, item, specification, moc, qty, unit, 0);
      }),
    }));
  }

  function generateBOQDataV2(data) {
    const {
      tonnerRequirement,
      cylinderRequirement,
      mountingType,
      containerType,
      totalSystem,
      noOfDosingPoints,
      workingTime,
      systemCapacity,
      gasLineSize,
      vacuumLineSize,
      suctionLineSize,
      dischargeLineSize,
      solutionLineSize,
      diffuserLineSizes,
      diffuserPipeLengths,
      csGasLineLength,
      upvcGasLineLength,
      solutionLineClientScope,
      lengthDischarge,
    } = data;
    const tonnerAreaQty =
      Math.ceil((workingTime * systemCapacity) / 930) * 2;
    const size = (value) => `${Number(value || 0).toFixed(2)} inch`;
    const diffuserSize =
      (diffuserLineSizes || [])
        .map((value, index) => `DP${index + 1}: ${size(value)}`)
        .join(", ") || "0.00 inch";
    const diffuserLength =
      (diffuserPipeLengths || []).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      ) * totalSystem;
    const row = (slNo, item, specification, moc, qty, unit, price) => ({
      slNo,
      item,
      specification,
      moc,
      qty,
      unit,
      price,
    });

    if (mountingType === "wall") {
      return [
        {
          area: "WALL MOUNTED SYSTEM - No BOQ template available yet",
          items: [],
        },
      ];
    }

    if (mountingType === "pedestal") {
      return generatePedestalBOQData({
        tonnerRequirement,
        cylinderRequirement,
        containerType,
        totalSystem,
        row,
      });
    }

    return [
      {
        area: "1. TONNER AREA",
        items: [
          row(
            1,
            "Tonner Roller Support",
            "With rail arrangement",
            "MS",
            tonnerAreaQty,
            "Set",
            6750,
          ),
          row(
            2,
            "Chlorine Tonner",
            "900 kg",
            "PESO Approved",
            tonnerRequirement,
            "No",
            145000,
          ),
          row(
            3,
            "Half Hood",
            "Tonner safety hood",
            "FRP",
            tonnerAreaQty,
            "No",
            14500,
          ),
          row(
            4,
            "Additional Ton Valve with Yoke",
            "Chlorine service",
            "Monel/PTFE",
            tonnerAreaQty,
            "Set",
            5760,
          ),
          row(
            5,
            "Flexible Copper Coil Tube",
            "Gas connection",
            "Copper/PTFE lined",
            tonnerAreaQty,
            "No",
            4000,
          ),
          row(
            6,
            "Manifold Valve",
            "Chlorine compatible",
            "Monel",
            tonnerAreaQty,
            "No",
            4500,
          ),
          row(
            7,
            "Tonner Manifold System",
            "Auto/manual changeover",
            "SS/Monel",
            1,
            "Set",
            75000,
          ),
          row(
            8,
            "Pressure Gauge",
            "0-25 bar",
            "SS",
            tonnerAreaQty,
            "No",
            12450,
          ),
          row(
            9,
            "Pressure Transmitter",
            "4-20 mA",
            "SS",
            tonnerAreaQty,
            "No",
            18540,
          ),
          row(
            10,
            "Isolation Valve",
            "Size 1/2 inch",
            "Monel/PTFE",
            tonnerAreaQty * 2,
            "Nos",
            14500,
          ),
          row(
            11,
            "Auto Shut-off/Change-over Valve",
            "Safety interlock",
            "Monel/PTFE",
            1,
            "No",
            45000,
          ),
          row(
            12,
            "Flexible Connector",
            "Secondary connection",
            "SS/PTFE",
            "As req",
            "No",
            2500,
          ),
          row(
            13,
            "Teflon Gaskets",
            "Spare",
            "Teflon",
            "As req",
            "Nos",
            120,
          ),
          row(
            14,
            "Tonner Stand Anchor Bolts",
            "M16/M20",
            "GI/SS",
            "As req",
            "Nos",
            100,
          ),
          row(
            15,
            "Fasteners (Bolt/Nut/Washer)",
            "Complete set",
            "SS/GI",
            "As req",
            "Lot",
            100,
          ),
        ],
      },
      {
        area: "2. CHLORINATOR AREA",
        items: [
          row(
            16,
            "Gas Filter",
            "Chlorine gas line",
            "SS/PTFE",
            totalSystem,
            "No",
            22000,
          ),
          row(
            17,
            "Ball Valve",
            `Size: ${size(gasLineSize)}`,
            "CS",
            totalSystem,
            "Nos",
            14500,
          ),
          row(
            18,
            "Pressure Reducing Valve",
            "Chlorine service",
            "Monel/PTFE",
            totalSystem,
            "No",
            22000,
          ),
          row(
            19,
            "Pressure Gauge",
            "Line monitoring",
            "SS",
            totalSystem,
            "No",
            12450,
          ),
          row(
            20,
            "Isolation Valve",
            "Size 1/2 inch",
            "Monel/PTFE",
            totalSystem,
            "No",
            14500,
          ),
          row(
            21,
            "Automatic Vacuum Regulator (AVR)",
            "To regulate vacuum from tonner",
            "PTFE",
            totalSystem,
            "No",
            28500,
          ),
          row(
            22,
            "Pressure Relief Valve",
            "Safety",
            "SS/PTFE",
            totalSystem,
            "No",
            6500,
          ),
          row(
            23,
            "Chlorinator",
            `${systemCapacity} Kg/hr`,
            "PVC/PTFE",
            totalSystem,
            "No",
            24000,
          ),
          row(
            24,
            "Rotameter",
            "Gas flow",
            "Acrylic/PVC",
            totalSystem,
            "No",
            12500,
          ),
          row(
            25,
            "Flow Control Valve",
            "Fine control",
            "PTFE",
            totalSystem,
            "No",
            12500,
          ),
          row(
            26,
            "Pressure Regulator",
            "Secondary control",
            "SS/PTFE",
            totalSystem,
            "No",
            18500,
          ),
          row(
            27,
            "Vacuum Relief Valve",
            "Safety",
            "PTFE",
            totalSystem,
            "No",
            6500,
          ),
          row(
            28,
            "Vacuum Gauge",
            "-1 to 0 bar",
            "SS",
            totalSystem,
            "No",
            12450,
          ),
          row(
            29,
            "Drain Relief Valve",
            "Drain line",
            "PVC",
            totalSystem,
            "No",
            6500,
          ),
          row(
            30,
            "Non Return Valve",
            `Size: ${size(vacuumLineSize)}`,
            "PTFE",
            totalSystem,
            "No",
            6500,
          ),
          row(
            31,
            "Ball Valve",
            `Size: ${size(vacuumLineSize)}`,
            "PVC/PTFE",
            totalSystem,
            "Nos",
            14500,
          ),
          row(
            32,
            "Interconnecting Pipe",
            `Size: ${size(gasLineSize)}`,
            "CS",
            csGasLineLength,
            "M",
            1650,
          ),
          row(
            33,
            "Interconnecting Pipe",
            `Size: ${size(vacuumLineSize)}`,
            "PTFE/PVC",
            upvcGasLineLength,
            "M",
            1200,
          ),
          row(
            34,
            "Tube fittings & ferrules",
            "Instrument connection",
            "SS/PTFE",
            "As req",
            "Lot",
            20000,
          ),
          row(
            35,
            "Pipe Supports & Clamps",
            "Chlorinator mounting",
            "GI/SS",
            "As req",
            "Nos",
            40000,
          ),
        ],
      },
      {
        area: "3. BOOSTER PUMP AREA",
        items: [
          row(
            36,
            "Basket Type Strainer",
            "Water line",
            "UPVC/SS",
            1,
            "No",
            34000,
          ),
          row(
            37,
            "Butterfly Valve (Inlet)",
            `Size: ${size(suctionLineSize)}`,
            "CI/DI",
            totalSystem,
            "No",
            28500,
          ),
          row(
            38,
            "Butterfly Valve (Outlet)",
            `Size: ${size(dischargeLineSize)}`,
            "CI/DI",
            totalSystem,
            "No",
            26500,
          ),
          row(
            39,
            "Booster Pump",
            "5 m3/hr, 25 m head",
            "CI/SS",
            totalSystem,
            "No",
            165000,
          ),
          row(
            40,
            "Local Push Button Station",
            "Start/Stop",
            "Industrial",
            totalSystem,
            "No",
            14500,
          ),
          row(
            41,
            "Pressure Gauge",
            "0-16 bar",
            "SS",
            totalSystem,
            "No",
            12450,
          ),
          row(
            42,
            "Isolation Valve",
            "Size 1/2 inch",
            "UPVC/SS",
            totalSystem,
            "Nos",
            6000,
          ),
          row(
            43,
            "Check Valve",
            `Size: ${size(dischargeLineSize)}`,
            "CI/SS",
            totalSystem,
            "No",
            12450,
          ),
          row(
            44,
            "Pump Suction Pipe",
            `Size: ${size(suctionLineSize)}`,
            "MS/UPVC",
            totalSystem,
            "M",
            1850,
          ),
          row(
            45,
            "Pump Discharge Pipe",
            `Size: ${size(dischargeLineSize)}`,
            "MS/UPVC",
            lengthDischarge,
            "M",
            1850,
          ),
          row(
            46,
            "Flexible Coupling",
            "Pump",
            "Rubber",
            "If req",
            "Set",
            8500,
          ),
          row(
            47,
            "Anti-vibration Pads",
            "Pump base",
            "Rubber",
            "As req",
            "Set",
            8500,
          ),
          row(
            48,
            "Pump Foundation Bolts",
            "M16",
            "SS/GI",
            "As req",
            "Nos",
            1500,
          ),
        ],
      },
      {
        area: "4. INJECTOR / DOSING AREA",
        items: [
          row(
            49,
            "Injector",
            "Chlorine mixing",
            "PVC/PTFE",
            totalSystem,
            "No",
            28500,
          ),
          row(
            50,
            "Check Valve",
            `Size: ${size(solutionLineSize)}`,
            "UPVC",
            totalSystem,
            "No",
            18500,
          ),
          row(
            51,
            "Diaphragm Valve",
            `Size: ${size(solutionLineSize)}`,
            "PVC",
            totalSystem * 2,
            "No",
            24000,
          ),
          row(
            52,
            "Solution Pipe (Injector to Diffuser)",
            `Size: ${size(solutionLineSize)}`,
            "UPVC/CPVC",
            Math.max(lengthDischarge - solutionLineClientScope, 0),
            "M",
            1850,
          ),
          row(
            "CE",
            "Solution Pipe (Injector to Diffuser)",
            `Size: ${size(solutionLineSize)}`,
            "UPVC/CPVC",
            `${solutionLineClientScope} (Client Scope)`,
            "M",
            "CE",
          ),
          row(
            53,
            "Elbows / Tees / Reducers",
            "Pipe fittings",
            "UPVC",
            "As req",
            "Lot",
            20000,
          ),
          row(
            54,
            "Unions",
            "Maintenance",
            "UPVC",
            "As req",
            "Nos",
            3000,
          ),
          row(
            55,
            "Pipe Clamps",
            "Support",
            "GI/SS",
            "As req",
            "Nos",
            100,
          ),
          row(
            56,
            "U-Bolts",
            "Pipe fixing",
            "GI/SS",
            "As req",
            "Nos",
            100,
          ),
          row(57, "Threaded Rods", "Support", "GI", "As req", "M", 200),
          row(
            58,
            "Anchor Fasteners",
            "M10/M12",
            "SS",
            "As req",
            "Nos",
            150,
          ),
          row(
            59,
            "Gaskets",
            "Joint sealing",
            "PTFE/Rubber",
            "As req",
            "Nos",
            20,
          ),
          row(60, "PTFE Tape", "Sealing", "PTFE", "As req", "Nos", 120),
        ],
      },
      {
        area: "5. ELECTRICAL & INSTRUMENTATION",
        items: [
          row(61, "Control Panel", "PLC based", "-", 1, "No", 545000),
          row(
            62,
            "Chlorine Leak Detector (2 Sensors)",
            "Fixed type",
            "-",
            1,
            "Set",
            64500,
          ),
          row(63, "Hooter + Beacon", "Alarm", "-", 1, "Set", 14500),
          row(
            64,
            "FRC Analyser",
            "Analyser Instrument",
            "Client Scope",
            "1 (Client Scope)",
            "Set",
            "CE",
          ),
          row(65, "Power Cable", "Pump supply", "-", 40, "M", 240),
          row(66, "Control Cable", "Signals", "-", 20, "M", 300),
          row(67, "Instrument Cable", "Shielded", "-", 40, "M", 300),
          row(68, "Cable Tray", "Ladder type", "-", 60, "M", 390),
          row(
            69,
            "Cable Tray Supports",
            "MS",
            "-",
            "As req",
            "Set",
            1200,
          ),
          row(
            70,
            "Cable Glands",
            "Double compression",
            "-",
            "As req",
            "Nos",
            650,
          ),
          row(71, "Cable Lugs", "Copper", "-", "As req", "Nos", 15000),
          row(
            72,
            "Ferrules",
            "Identification",
            "-",
            "As req",
            "Nos",
            8000,
          ),
          row(
            73,
            "Junction Boxes",
            "Field wiring",
            "-",
            "As req",
            "Nos",
            15000,
          ),
          row(
            74,
            "Earthing Cable (Client Scope)",
            "Cu/GI",
            "Client Scope",
            "As req (Client Scope)",
            "M",
            "CE",
          ),
          row(
            75,
            "Earthing Electrode (Client Scope)",
            "GI plate",
            "Client Scope",
            "1 (Client Scope)",
            "Set",
            "CE",
          ),
        ],
      },
      {
        area: "7. STRUCTURAL + CIVIL + GENERAL",
        items: [
          row(
            76,
            "Base Frame / Skid",
            "Fabricated",
            "MS",
            1,
            "Set",
            240000,
          ),
          row(
            77,
            "Equipment Supports",
            "Fabricated",
            "MS",
            "As req",
            "Kg",
            145000,
          ),
          row(
            78,
            "Grouting Material",
            "Cement/chemical",
            "As req",
            "Lot (Client Scope)",
            "Lot",
            "CE",
          ),
          row(
            79,
            "Painting",
            "Epoxy coating",
            "As req",
            "Lot (Client Scope)",
            "Lot",
            "CE",
          ),
          row(
            80,
            "Name Plates",
            "Equipment tags",
            "SS",
            "As req",
            "Nos",
            8500,
          ),
          row(
            81,
            "Danger Boards",
            "Chlorine hazard",
            "As req",
            "As req",
            "Nos",
            25000,
          ),
        ],
      },
      {
        area: "5. DIFFUSER AREA",
        items: [
          row(
            82,
            "Diffuser",
            "Dosing point",
            "PVC/SS",
            noOfDosingPoints * totalSystem,
            "No",
            14500,
          ),
          row(
            83,
            "Rotameter",
            "Flowmeter",
            "UPVC/CPVC",
            noOfDosingPoints * totalSystem,
            "No",
            0,
          ),
          row(
            83,
            "Globe valve/butterfly valve/Diaphragm valve",
            `Size: ${diffuserSize}`,
            "UPVC/CPVC",
            totalSystem,
            "No",
            8500,
          ),
          row(
            84,
            "Diffuser line length",
            `Size: ${diffuserSize}`,
            "UPVC/CPVC",
            diffuserLength,
            "M",
            8500,
          ),
        ],
      },
    ];
  }

  // [id stem, label, K factor used in calculate()]; suction/discharge ids are `${stem}Suction` / `${stem}Discharge`
  const FITTINGS = [
    ['elbow90', '90° Standard Elbow'], ['elbow45', '45° Standard Elbow'], ['elbowLR', '90° Long Radius Elbow'],
    ['teeStraight', 'Tee – Straight Through'], ['teeBranch', 'Tee – Branch Flow'], ['gateValve', 'Gate Valve (Full Open)'],
    ['ballValve', 'Ball Valve (Full Open)'], ['manifoldValve', 'Manifold Valve'], ['globeValve', 'Globe Valve (Full Open)'],
    ['swingCheck', 'Swing Check Valve'], ['butterflyValve', 'Butterfly Valve (Full Open)'], ['diaphragmValve', 'Diaphragm Valve'],
    ['nrv', 'Non-Return Valve (NRV)'], ['flowmeter', 'Flow meter (rotameter)'], ['union', 'Union'], ['connector', 'Connector'],
    ['coupling', 'Coupling'], ['reducer', 'Reducer'], ['reducerTapered', 'Reducer (Tapered)'],
  ];
  const SUCTION_DEFAULTS = { elbow90: 3, teeStraight: 1, butterflyValve: 1, flowmeter: 7, connector: 5 };
  const DISCHARGE_DEFAULTS = { elbow90: 3, teeStraight: 1, ballValve: 1, butterflyValve: 1, diaphragmValve: 2, nrv: 2, flowmeter: 1, connector: 5 };
  const fittings = (side, defs) => FITTINGS.map(([k, label]) => F(k + side, label, 'Nos', defs[k] != null ? defs[k] : ''));

  function sections(v, ts) {
    const points = Math.max(1, parseInt(v.noOfDosingPoints) || 1);
    return [
      { title: 'Basic Parameters', fields: [
        F('workingTime', 'Working Time', 'hours', 22),
        { ...F('flowRateM3', 'Flow Rate', '', ''), unitSel: { id: 'flowRateUnit', value: 'm3hr', opts: [{ value: 'm3hr', label: 'm³/hr' }, { value: 'mld', label: 'MLD' }, { value: 'ltrhr', label: 'ltr/hr' }] } },
        F('systemCapacityInput', 'System Capacity', 'kg/hr', ''),
        F('mountingType', 'Mounting Type', '', 'floor', 'select', [{ value: 'floor', label: 'Floor Mounted' }, { value: 'wall', label: 'Wall Mounted' }, { value: 'pedestal', label: 'Pedestal Mounted' }]),
        F('containerType', 'Container Type', '', 'tonner', 'select', [{ value: 'tonner', label: 'Tonner' }, { value: 'cylinder', label: 'Cylinder' }]),
        F('tonnerRequirementInput', 'Tonner Requirement (optional)', 'nos', ''),
        F('cylinderRequirementInput', 'Cylinder Requirement (optional)', 'nos', ''),
        { ...F('noOfDosingPoints', 'No of Dosing Points', 'Nos', 1), rerender: true },
      ] },
      { title: 'Velocity Parameters', fields: [
        F('velocityVacuum', 'Input Vacuum Velocity', 'm/s', 8),
        F('velocityGas', 'Input Gas Velocity', 'm/s', 8),
        F('velocitySuction', 'Input Suction Velocity', 'm/s', 1),
        F('velocityDischarge', 'Input Discharge Velocity', 'm/s', 1.5),
        F('velocitySolution', 'Input Solution Velocity', 'm/s', 1),
      ] },
      { title: 'Suction Line Parameters', fields: [
        F('roughnessSuction', 'Absolute Roughness', 'mm', 0.0015),
        F('lengthSuction', 'Pipe Line Length', 'm', 2),
        F('pSuction', 'P Suction', 'bar', ''),
        F('zSuctionSurface', 'Z Suction Surface', 'm', 2),
        F('zSuctionCenterline', 'Z Suction Centerline', 'm', ''),
      ] },
      { title: 'Discharge Line Parameters', fields: [
        F('roughnessDischarge', 'Absolute Roughness', 'mm', 0.0015),
        F('lengthDischarge', 'Pipe Line Length', 'm', 10),
        F('pDischarge', 'P Discharge', 'bar', ''),
        F('zDischargeSurface', 'Z Discharge Surface', 'm', 5),
        F('zDischargeCenterline', 'Z Discharge Centerline', 'm', ''),
      ] },
      { title: 'Fittings - Suction Line', fields: fittings('Suction', SUCTION_DEFAULTS) },
      { title: 'Fittings - Discharge Line', fields: fittings('Discharge', DISCHARGE_DEFAULTS) },
      { title: 'Injector Parameters', fields: [F('pInjectorLoss', 'P Injector Loss', 'bar', 1)] },
      { title: 'Dosing Configuration', blocks: Array.from({ length: points }, (_, j) => {
        const i = j + 1;
        return { sub: `Dosing Point ${i}`, fields: [
          F(`dosage_${i}`, 'Dosage', 'ppm', ts && ts.defaultDose != null ? ts.defaultDose : 4),
          F(`demand_${i}`, 'Demand', 'ppm', ''),
          F(`residual_${i}`, 'Residual', 'ppm', ''),
          F(`solutionStrength_${i}`, 'Solution Strength', 'ppm', 2000),
          F(`velocityDiffuser_${i}`, 'Input Velocity Diffuser', 'm/s', 0.4),
          F(`velocityDiffuserHole_${i}`, 'Input Velocity Diffuser Hole', 'm/s', 3.5),
          F(`diffuserLineSize_${i}`, 'Diffuser Line Size', 'inch', ''),
          F(`diffuserPipeLength_${i}`, 'Diffuser Pipe Length', 'm', ''),
          F(`hSubmergence_${i}`, 'Hsubmergence', 'm', ''),
          F(`diameterHole_${i}`, 'Diameter of Hole', 'mm', 6),
          F(`ccSpacingLength_${i}`, 'C-C Spacing along Length', 'mm', 75),
          F(`marginSpace_${i}`, 'Margin Space on Both Sides', 'mm', 50),
        ] };
      }) },
      { title: 'BOQ Configuration', fields: [
        F('workingSystem', 'No of Working System', 'Nos', 1),
        F('standbySystem', 'No of Standby System', 'Nos', 1),
        F('csGasLineLength', 'CS Gas Line Length', 'm', 6),
        F('upvcGasLineLength', 'UPVC Gas Line Length', 'm', 6),
        F('solutionLineClientScope', 'Solution Line Length (Client Scope)', 'm', 90),
      ] },
      { title: 'Calculation Constants', fields: [
        F('molecularWeight', 'Molecular Weight', 'Kg/Kmol', 70.9),
        F('ambientTemp', 'Ambient Temp', '°C', 30),
        F('pressureGauge', 'Pressure Gauge', 'bar', -0.5),
        F('pgGasLine', 'PG Gas Line', 'bar', 9),
        F('tempGasLine', 'Temp Gas Line', '°C', 30),
      ] },
      { title: 'Design Report Remark', fields: [F('designReportRemark', 'Remark', '', CALC_REMARK, 'textarea')] },
    ];
  }

  // Calculations saved by the earlier, simplified gas calculator used different field names
  function migrate(i) {
    if (!i || i.flowRateM3 != null || i.flow == null) return i;
    const unit = { 'm3/hr': 'm3hr', MLD: 'mld', 'ltr/hr': 'ltrhr', 'm3/day': 'm3hr' }[i.unit] || 'm3hr';
    return {
      flowRateM3: i.unit === 'm3/day' ? (Number(i.flow) || 0) / 24 : i.flow, flowRateUnit: unit,
      dosage_1: i.dose, workingTime: i.hours, containerType: Number(i.cyl) === 100 ? 'cylinder' : 'tonner',
    };
  }

  return { sections, compute(v) { CUR = v; return calculate(); }, migrate };
})();

/* ============================== ClO2 (2 chem) ============================== */
const CLO2_ENGINE = (() => {
  let CUR = {};
  function getNum(id) { const v = parseFloat(CUR[id]); return isNaN(v) ? 0 : v; }
  function getText(id) { return CUR[id] == null ? '' : String(CUR[id]); }

  function F(id, label, unit, value, type, opts) {
    return { id, label, unit: unit || "", value, type: type || "num", opts };
  }

  const INPUT_GROUPS = [
    {
      group: "System Inputs",
      sections: [
        {
          title: "System Basis",
          fields: [
            F("I_E5", "Water Treated", "m3/hr", 44000),
            F("I_E6", "Chlorine Demand", "ppm", 1),
            F("I_E7", "Residual Chlorine", "ppm", 0.5),
            // Leave blank (0) to size the plant from the water duty below.
            // If the client has dictated a capacity, enter it with its
            // matching unit — it then overrides the water-duty calculation
            // (Questionnaire!C25 -> Calculation!F7 priority in the source
            // workbook). See systemCapacity in calculate().
            F("I_E8", "System Capacity (If Client Said)", "", 0),
            F("I_E8_UNIT", "System Capacity Unit", "", "Kg/hr", "select", ["Kg/hr", "g/hr"]),
            F("I_E9", "Operating time", "hrs", 24),
            F("I_E10", "Sodium Chlorite (NaClO2) Concentration", "%", 25),
            F("I_E11", "Hydrochloric Acid (HCl) Concentration", "%", 33),
            F("I_E12", "Excess Factor", "", 3.7),
            F("T_E4", "System Efficiency", "%", 80),
            F("BULK_STORAGE_REQUIRED", "Bulk Storage Needed?", "", "Yes", "select", ["Yes", "No"]),
          ],
        },
        {
          title: "NaClO2 Bulk Storage Tank",
          bulkOptional: true,
          fields: [
            F("I_E14", "Storage Days", "Days", 15),
            F("I_E15", "No.of Tanks", "Tanks", 15),
            F("I_E16", "Single Tank Volume Known", "KL", 50),
          ],
        },
        {
          title: "HCl Bulk Storage Tank",
          bulkOptional: true,
          fields: [
            F("I_E18", "Storage Days", "Days", 15),
            F("I_E19", "No.of Tanks", "Tanks", 15),
            F("I_E20", "Single Tank Volume Known", "KL", 50),
          ],
        },
        {
          title: "Unloading Pump > NaClO2",
          bulkOptional: true,
          fields: [
            F("I_E23", "Filling Time", "hr", 3),
            F("I_E24", "Pump Capacity Known", "m3/hr", 3),
            F("I_E25", "Length of pipe from lorry to Unloading Pump", "m", 2),
            F("I_E26", "Length of pipe from Pump to Bulk storage Tank", "m", 6),
          ],
        },
        {
          title: "Unloading Pump > HCl",
          bulkOptional: true,
          fields: [
            F("I_E28", "Filling Time", "hr", 3),
            F("I_E29", "Pump Capacity Known", "m3/hr", 3),
            F("I_E30", "Length of pipe from lorry to Unloading Pump", "m", 2),
            F("I_E31", "Length of pipe from Pump to Bulk storage Tank", "m", 6),
          ],
        },
        {
          title: "Measuring Tank > NaClO2",
          fields: [
            F("I_E35", "Tank Type", "", "CYLINDRICAL TANK", "select", ["CYLINDRICAL TANK", "RECTANGULAR TANK"]),
            F("I_E36", "Autonomy hours", "hrs/day", 24),
          ],
        },
        {
          title: "Measuring Tank > HCl",
          fields: [
            F("I_E38", "Tank Type", "", "CYLINDRICAL TANK", "select", ["CYLINDRICAL TANK", "RECTANGULAR TANK"]),
            F("I_E39", "Autonomy hours", "hrs/day", 24),
          ],
        },
        {
          title: "Transfer Pump > NaClO2",
          bulkOptional: true,
          fields: [
            F("I_E43", "Filling Time", "min", 120),
            F("I_E44", "Pump Capacity Known", "m3/hr", 3),
            F("I_E45", "Length of pipe from Storage tank to Pump", "m", 2),
            F("I_E46", "Length of pipe from Pump to Measuring Tank", "m", 6),
          ],
        },
        {
          title: "Transfer Pump > HCl",
          bulkOptional: true,
          fields: [
            F("I_E48", "Filling Time", "min", 120),
            F("I_E49", "Pump Capacity Known", "m3/hr", 3),
            F("I_E50", "Length of pipe from Storage tank to Unloading Pump", "m", 2),
            F("I_E51", "Length of pipe from Pump to Measuring Tank", "m", 6),
          ],
        },
        {
          title: "Dosing Pump > NaClO2",
          fields: [F("I_E55", "Length of pipe from measuring to Dosing pump", "m", 20)],
        },
        {
          title: "Dosing Pump > HCl",
          fields: [F("I_E57", "Length of pipe from measuring to Dosing pump", "m", 20)],
        },
        {
          title: "Motive Water",
          fields: [
            F("I_E60", "Water Available Pressure (Client)", "Bar", 3),
            F("I_E61", "Static Head", "m", 3),
            F("I_E62", "Length of pipe from water inlet to reactor", "m", 8),
          ],
        },
        {
          title: "Reactor Outlet to Dosing Point",
          fields: [
            F("I_E65", "Ambient temperature (Max)", "°C", 30),
            F("I_E66", "Distance from reactor to dosing point", "m", 20),
            F("I_E67", "Static Head", "m", 3),
            F("I_E68", "Dosing point type", "", "Sump", "select", ["Sump", "Open Tank", "Pipeline"]),
            F("I_E70", "Sump Depth", "m", 5),
            F("I_E72", "Pipeline operating pressure", "Bar", 3),
            F("I_E75", "Tank Depth", "m", 3),
            F("I_E76", "Reactor MOC", "", "FRP", "select", ["FRP", "MS + FRP LINING", "MS + PTFE LINING"]),
          ],
        },
      ],
    },
  ];

  /* Minor-loss fitting K-factors, from the PDF's SUM(k1*E1, k2*E2 ...) terms.
     Order/labels follow each Minor Loss block's B-column fitting names. */
  const FITTING_K = {
    DV_OPEN: 3,
    CV_SWING: 3,
    YS_CLEAN: 2,
    CC_PVDF: 1.5,
    PRV_OPEN: 5,
    PD_STANDARD: 2,
    FM_ROTA: 3,
  };
  const FITTING_NAMES = {
    DV_OPEN: "Diaphragm Valve",
    CV_SWING: "Check Valve",
    YS_CLEAN: "Y Strainer",
    CC_PVDF: "Calibration Column",
    PRV_OPEN: "Pressure Relief Valve",
    PD_STANDARD: "Pulsation Dampener",
    FM_ROTA: "Flow Meter",
  };

  function minorLossFields(prefix, entries) {
    const counts = {};
    return entries.map(([type, value]) => {
      counts[type] = (counts[type] || 0) + 1;
      const id = `${prefix}_${type}_${counts[type]}`;
      return F(id, `${FITTING_NAMES[type]} ${counts[type] > 1 ? counts[type] : ""}`.trim(), "Nos", value);
    });
  }

  function minorLossSum(prefix, entries) {
    const counts = {};
    let sum = 0;
    entries.forEach(([type]) => {
      counts[type] = (counts[type] || 0) + 1;
      const id = `${prefix}_${type}_${counts[type]}`;
      sum += FITTING_K[type] * getNum(id);
    });
    return sum;
  }

  const TECH_GROUPS = [
    {
      group: "Bulk Storage Tanks",
      sections: [
        {
          title: "NaClO2 Bulk Storage Tank — Technical Parameters",
          bulkOptional: true,
          blocks: [
            { sub: "Volume / Cylindrical Tank", fields: [F("T_E7", "Safety factor", "%", 10)] },
            { sub: "Dimensions", fields: [F("T_E9", "H/D Ratio", "", 1.7), F("T_E10", "Freeboard", "%", 12)] },
            { sub: "Thickness", fields: [F("T_E13", "Safety Factor", "", 2)] },
            {
              sub: "Thickness > PP Layer",
              fields: [
                F("T_E15", "Allowable Stress - PP", "Mpa", 8),
                F("T_E16", "PP Joint Efficiency", "", 0.8),
                F("T_E17", "PP Corrosion Allowance", "mm", 0),
              ],
            },
            {
              sub: "Thickness > FRP Layer",
              fields: [
                F("T_E19", "Allowable Stress - FRP (Vinyl Ester)", "MPa", 13),
                F("T_E20", "FRP Joint Efficiency", "", 0.85),
                F("T_E21", "FRP Corrosion Allowance", "mm", 0),
              ],
            },
            { sub: "Nozzle Details", fields: [F("T_E23", "Level Sensor", "NB", 80)] },
          ],
        },
        {
          title: "HCl Bulk Storage Tank — Technical Parameters",
          bulkOptional: true,
          blocks: [
            { sub: "Volume / Cylindrical Tank", fields: [F("T_E26", "Safety factor", "%", 10)] },
            { sub: "Dimensions", fields: [F("T_E28", "H/D Ratio", "", 1.7), F("T_E29", "Freeboard", "%", 12)] },
            { sub: "Thickness", fields: [F("T_E32", "Safety Factor", "", 2)] },
            {
              sub: "Thickness > PP Layer",
              fields: [
                F("T_E34", "Allowable Stress - PP", "Mpa", 8),
                F("T_E35", "PP Joint Efficiency", "", 0.8),
                F("T_E36", "PP Corrosion Allowance", "mm", 0),
              ],
            },
            {
              sub: "Thickness > FRP Layer",
              fields: [
                F("T_E38", "Allowable Stress - FRP (Vinyl Ester)", "MPa", 13),
                F("T_E39", "FRP Joint Efficiency", "", 0.85),
                F("T_E40", "FRP Corrosion Allowance", "mm", 0),
              ],
            },
            { sub: "Nozzle Details", fields: [F("T_E42", "Level Sensor", "NB", 80)] },
          ],
        },
      ],
    },
    {
      group: "Unloading Pump",
      sections: [
        {
          title: "Unloading Pump — NaClO2",
          bulkOptional: true,
          blocks: [
            {
              sub: "Suction Side",
              fields: [
                F("T_E46", "Velocity", "m/s", 0.6),
                F("T_E47", "Minimum liquid level in storage tank", "m", 0.5),
                F("T_E48", "Pump suction centerline from floor level", "m", 0.1),
              ],
            },
            {
              sub: "Suction Side > Minor Loss",
              fields: [
                ...minorLossFields("UPN_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
                F("T_E60", "NPSH Required", "m", 2.5),
              ],
            },
            { sub: "Discharge Side", fields: [F("T_E62", "Velocity", "m/s", 1)] },
            {
              sub: "Discharge Side > Minor Loss",
              fields: minorLossFields("UPN_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
            },
            { sub: "Required Pump Discharge Head", fields: [F("T_E75", "Design Margin", "%", 30)] },
          ],
        },
        {
          title: "Unloading Pump — HCl",
          bulkOptional: true,
          blocks: [
            {
              sub: "Suction Side",
              fields: [
                F("T_E78", "Velocity", "m/s", 0.6),
                F("T_E79", "Minimum liquid level in storage tank", "m", 0.5),
                F("T_E80", "Pump suction centerline from floor level", "m", 0.1),
              ],
            },
            {
              sub: "Suction Side > Minor Loss",
              fields: [
                ...minorLossFields("UPH_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
                F("T_E92", "NPSH Required", "m", 2.5),
              ],
            },
            { sub: "Discharge Side", fields: [F("T_E94", "Velocity", "m/s", 1)] },
            {
              sub: "Discharge Side > Minor Loss",
              fields: minorLossFields("UPH_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
            },
            { sub: "Required Pump Discharge Head", fields: [F("T_E107", "Design Margin", "%", 30)] },
          ],
        },
      ],
    },
    {
      group: "Transfer Pump",
      sections: [
        {
          title: "Transfer Pump — NaClO2",
          bulkOptional: true,
          blocks: [
            {
              sub: "Suction Side",
              fields: [
                F("T_E211", "Velocity", "m/s", 0.6),
                F("T_E212", "Minimum liquid level in storage tank", "m", 0.5),
                F("T_E213", "Pump suction centerline from floor level", "m", 0.1),
              ],
            },
            {
              sub: "Suction Side > Minor Loss",
              fields: [
                ...minorLossFields("TPN_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
                F("T_E225", "NPSH Required", "m", 2.5),
              ],
            },
            { sub: "Discharge Side", fields: [F("T_E227", "Velocity", "m/s", 1)] },
            {
              sub: "Discharge Side > Minor Loss",
              fields: minorLossFields("TPN_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
            },
            { sub: "Required Pump Discharge Head", fields: [F("T_E240", "Design Margin", "%", 30)] },
          ],
        },
        {
          title: "Transfer Pump — HCl",
          bulkOptional: true,
          blocks: [
            {
              sub: "Suction Side",
              fields: [
                F("T_E243", "Velocity", "m/s", 0.6),
                F("T_E244", "Minimum liquid level in storage tank", "m", 0.5),
                F("T_E245", "Pump suction centerline from floor level", "m", 0.1),
              ],
            },
            {
              sub: "Suction Side > Minor Loss",
              fields: [
                ...minorLossFields("TPH_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
                F("T_E257", "NPSH Required", "m", 2.5),
              ],
            },
            { sub: "Discharge Side", fields: [F("T_E259", "Velocity", "m/s", 1)] },
            {
              sub: "Discharge Side > Minor Loss",
              fields: minorLossFields("TPH_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
            },
            { sub: "Required Pump Discharge Head", fields: [F("T_E272", "Design Margin", "%", 30)] },
          ],
        },
      ],
    },
    {
      group: "Measuring Tank",
      sections: [
        {
          title: "Measuring Tank — NaClO2",
          blocks: [
            { sub: "Cylindrical Tank / Volume", fields: [F("T_E113", "Safety factor", "%", 10)] },
            { sub: "Cylindrical Tank / Dimensions", fields: [F("T_E115", "H/D Ratio", "", 1.7), F("T_E116", "Freeboard", "%", 12)] },
            { sub: "Cylindrical Tank / Thickness", fields: [F("T_E119", "Safety Factor", "", 2)] },
            {
              sub: "Cylindrical Tank / Thickness > PP Layer",
              fields: [F("T_E121", "Allowable Stress - PP", "Mpa", 8), F("T_E122", "PP Joint Efficiency", "", 0.8), F("T_E123", "PP Corrosion Allowance", "mm", 0)],
            },
            {
              sub: "Cylindrical Tank / Thickness > FRP Layer",
              fields: [F("T_E125", "Allowable Stress - FRP (Vinyl Ester)", "MPa", 13), F("T_E126", "FRP Joint Efficiency", "", 0.85), F("T_E127", "FRP Corrosion Allowance", "mm", 0)],
            },
            { sub: "Cylindrical Tank / Nozzle Details", fields: [F("T_E129", "Level Sensor", "NB", 80), F("T_E130", "Level Gauge Top", "NB", 40), F("T_E131", "Level Gauge Bottom", "NB", 40)] },
            { sub: "Rectangular Tank / Dimensions", fields: [F("T_E134", "Liquid Height Selection", "m", 1.7), F("T_E135", "FreeBoard", "%", 12), F("T_E136", "Rectangular L/B Ratio (1.2 to 1.5)", "", 1.33)] },
            { sub: "Rectangular Tank / Thickness", fields: [F("T_E139", "Safety Factor", "", 2)] },
            {
              sub: "Rectangular Tank / Thickness > PP Layer",
              fields: [F("T_E141", "Allowable Stress - PP at 40°C", "Mpa", 8), F("T_E142", "Safety Factor for PP", "", 3)],
            },
            {
              sub: "Rectangular Tank / Thickness > FRP Layer",
              fields: [F("T_E144", "Allowable Stress - FRP (Vinyl Ester)", "Mpa", 13), F("T_E145", "Safety Factor for FRP", "", 2.5), F("T_E146", "Bottom Factor", "", 1.2)],
            },
            { sub: "Rectangular Tank / Nozzle Details", fields: [F("T_E148", "Level Sensor", "NB", 80), F("T_E149", "Level Gauge Top", "NB", 40), F("T_E150", "Level Gauge Bottom", "NB", 40)] },
          ],
        },
        {
          title: "Measuring Tank — HCl",
          blocks: [
            { sub: "Cylindrical Tank / Volume", fields: [F("T_E153", "Safety factor", "%", 10)] },
            { sub: "Cylindrical Tank / Dimensions", fields: [F("T_E156", "H/D Ratio", "", 1.7), F("T_E157", "Freeboard", "%", 12)] },
            {
              sub: "Cylindrical Tank / Thickness > PP Layer",
              fields: [F("T_E162", "Allowable Stress - PP", "Mpa", 8), F("T_E163", "PP Joint Efficiency", "", 0.8), F("T_E164", "PP Corrosion Allowance", "mm", 0)],
            },
            {
              sub: "Cylindrical Tank / Thickness > FRP Layer",
              fields: [F("T_E166", "Allowable Stress - FRP (Vinyl Ester)", "MPa", 13), F("T_E167", "FRP Joint Efficiency", "", 0.85), F("T_E168", "FRP Corrosion Allowance", "mm", 0)],
            },
            { sub: "Cylindrical Tank / Nozzle Details", fields: [F("T_E170", "Level Sensor", "NB", 80), F("T_E171", "Level Gauge Top", "NB", 40), F("T_E172", "Level Gauge Bottom", "NB", 40)] },
            { sub: "Rectangular Tank / Dimensions", fields: [F("T_E175", "Liquid Height Selection", "m", 1.7), F("T_E176", "FreeBoard", "%", 12), F("T_E177", "Rectangular L/B Ratio (1.2 to 1.5)", "", 1.33)] },
            {
              sub: "Rectangular Tank / Thickness > PP Layer",
              fields: [F("T_E182", "Allowable Stress - PP at 40°C", "Mpa", 8), F("T_E183", "Safety Factor for PP", "", 3)],
            },
            {
              sub: "Rectangular Tank / Thickness > FRP Layer",
              fields: [F("T_E185", "Allowable Stress - FRP (Vinyl Ester)", "Mpa", 13), F("T_E186", "Safety Factor for FRP", "", 2.5), F("T_E187", "Bottom Factor", "", 1.2)],
            },
            { sub: "Rectangular Tank / Nozzle Details", fields: [F("T_E189", "Level Sensor", "NB", 80), F("T_E190", "Level Gauge Top", "NB", 40), F("T_E191", "Level Gauge Bottom", "NB", 40)] },
          ],
        },
        {
          title: "Fume Absorber — HCl Bulk Storage Tank",
          blocks: [
            {
              sub: "Sizing",
              fields: [
                F("T_E194", "Breathing Allowance", "%", 25),
                F("T_E195", "Vent Velocity", "m/s", 3),
                F("T_E196", "Gas Velocity in absorber", "m/s", 1),
                F("T_E197", "H/D", "", 4),
                F("T_E198", "L/G", "L/m3", 10),
                F("T_E199", "Safety Factor", "", 2),
              ],
            },
          ],
        },
        {
          title: "Fume Absorber — HCl Measuring Tank",
          blocks: [
            {
              sub: "Sizing",
              fields: [
                F("T_E201", "Breathing Allowance", "%", 25),
                F("T_E202", "Vent Velocity", "m/s", 3),
                F("T_E203", "Gas Velocity in absorber", "m/s", 1),
                F("T_E204", "H/D", "", 4),
                F("T_E205", "L/G", "L/m3", 10),
                F("T_E206", "Safety Factor", "", 2),
              ],
            },
          ],
        },
      ],
    },
    {
      group: "Dosing Pump / Motive Water / Booster Pump",
      sections: [
        {
          title: "Dosing Pump — NaClO2",
          blocks: [
            {
              sub: "Suction Side",
              fields: [
                F("T_E277", "Velocity", "m/s", 0.3),
                F("T_E278", "Tank Outlet Nozzle from floor level", "m", 0.8),
                F("T_E279", "Pump Suction Centerline from floor level", "m", 0.5),
              ],
            },
            {
              sub: "Suction Side > Minor Loss",
              fields: [
                ...minorLossFields("DPN_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["CC_PVDF", 1], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
                F("T_E291", "NPSH Required", "m", 2.5),
              ],
            },
            {
              sub: "Discharge Side",
              fields: [F("T_E293", "Velocity", "m/s", 0.5), F("T_E294", "Static Height to Reactor Inlet", "m", 2), F("T_E295", "Length of pipe", "", 25)],
            },
            {
              sub: "Discharge Side > Minor Loss",
              fields: [
                ...minorLossFields("DPN_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 0], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 1], ["PD_STANDARD", 1], ["FM_ROTA", 1]]),
                F("T_E307", "Design Margin", "%", 15),
              ],
            },
          ],
        },
        {
          title: "Dosing Pump — HCl",
          blocks: [
            {
              sub: "Suction Side",
              fields: [
                F("T_E310", "Velocity", "m/s", 0.3),
                F("T_E311", "Tank Outlet Nozzle from floor level", "m", 0.8),
                F("T_E312", "Pump Suction Centerline from floor level", "m", 0.5),
              ],
            },
            {
              sub: "Discharge Side",
              fields: [F("T_E326", "Velocity", "m/s", 0.5), F("T_E327", "Static Height to Reactor Inlet", "m", 2), F("T_E328", "Length of pipe", "", 25)],
            },
          ],
        },
        {
          title: "Motive Water — Technical Parameters",
          blocks: [
            { sub: "Sizing", fields: [F("T_E343", "Target concentration", "ppm", 1000), F("T_E344", "Water Density", "Kg/l", 1), F("T_E345", "Velocity", "m/s", 1.5)] },
            {
              sub: "Minor Loss",
              fields: [
                F("MW_DV_1", "Diaphragm Valve 1", "Nos", 3),
                F("MW_DV_2", "Diaphragm Valve 2", "Nos", 2),
                F("MW_CV_1", "Check Valve 1", "Nos", 3),
                F("MW_CV_2", "Check Valve 2", "Nos", 3),
                F("MW_YS", "Y Strainer", "Nos", 1),
                F("MW_FM", "Flow Meter", "Nos", 1),
                F("T_E357", "Design Margin", "%", 10),
              ],
            },
          ],
        },
        {
          title: "Booster Pump",
          blocks: [
            { sub: "Suction Side", fields: [F("T_E362", "Velocity", "m/s", 1.5), F("T_E363", "Static Head", "m", 0.5), F("T_E364", "Length of pipe", "m", 4)] },
            {
              sub: "Suction Side > Minor Loss",
              fields: [
                ...minorLossFields("BP_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
                F("T_E376", "NPSH Required", "m", 2.5),
              ],
            },
            { sub: "Discharge Side", fields: [F("T_E379", "Length of pipe", "m", 10)] },
            {
              sub: "Discharge Side > Minor Loss",
              fields: minorLossFields("BP_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
            },
          ],
        },
      ],
    },
    {
      group: "Reactor",
      sections: [
        {
          title: "Reactor — Technical Parameters",
          blocks: [
            // Residence time default is only used for kg/hr systems — for
            // g/hr (small) systems it is auto-overridden to 45s regardless
            // of what's typed here (see residenceTimeSec in calculate()).
            { sub: "Sizing", fields: [F("T_E393", "Reactor Discharge Line Velocity", "m/s", 1.5), F("T_E394", "Residence time (Kg/hr systems)", "Sec", 30), F("T_E395", "Operational margin", "%", 10)] },
            {
              sub: "Diameter & Liquid Height",
              fields: [F("T_E397", "H/D", "", 3), F("T_E398", "Free board", "%", 10), F("T_E399", "Design Pressure Margin", "%", 15), F("T_E401", "Temperature Margin", "°C", 5), F("T_E402", "Hydrotest Pressure Margin", "", 1.2)],
            },
            {
              sub: "Option 1: Fully FRP Reactor (Vinyl Ester)",
              fields: [
                F("T_E406", "Allowable stress (S) for FRP @ 65°C", "Mpa", 13),
                F("T_E407", "Joint efficiency", "", 0.85),
                F("T_E408", "Corrosion allowance (CA)", "mm", 0),
                F("T_E409", "Minimum practical thickness", "mm", 6),
              ],
            },
            {
              sub: "Option 2: MS + FRP Lining",
              fields: [
                F("T_E414", "Allowable stress (S) for SA 516 Gr.70", "Mpa", 138),
                F("T_E415", "Joint efficiency", "", 0.85),
                F("T_E416", "Corrosion allowance (CA)", "mm", 3),
                F("T_E417", "Minimum MS thickness", "mm", 5),
                F("T_E418", "FRP lining thickness", "mm", 3),
              ],
            },
            {
              sub: "Option 3: MS + PTFE Lining",
              fields: [
                F("T_E420", "Allowable stress (S) for SA 516 Gr.70", "Mpa", 138),
                F("T_E421", "Joint efficiency", "", 0.85),
                F("T_E422", "Corrosion allowance (CA)", "mm", 3),
                F("T_E423", "Minimum MS thickness", "mm", 5),
                F("T_E424", "PTFE lining thickness", "mm", 3),
              ],
            },
            {
              sub: "Option 3 > Reactor Pressure Drop",
              fields: [
                F("T_E427", "Viscosity (water @ 30°C)", "Pa.s", 0.001),
                F("T_E430", "Inlet nozzle loss", "Bar", 0.1),
                F("T_E431", "Distribution manifold", "Bar", 0.2),
                F("T_E432", "Outlet nozzle loss", "Bar", 0),
              ],
            },
            {
              sub: "Reactor Outlet Line loss > Minor Loss",
              fields: minorLossFields("RX_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]),
            },
          ],
        },
      ],
    },
  ];

  // The entire Technical Input sheet (TECH_GROUPS) is internal-engineering
  // data — greyed out in the form and excluded from the normal saved PDF
  // (collectCalculationInputSections/stripInternalRows, js/calculations.js),
  // only appearing in the additional "(INT)" PDF. Flagging every section
  // here rather than annotating each one above by hand.
  TECH_GROUPS.forEach((g) => g.sections.forEach((s) => { s.internal = true; }));

  const SG_NACLO2_TABLE = { 7.5: 1.08, 10: 1.1, 15: 1.15, 20: 1.2, 25: 1.25, 30: 1.31, 31: 1.32, 35: 1.37, 40: 1.42 };
  const SG_HCL_TABLE = { 5: 1.02, 10: 1.05, 15: 1.07, 20: 1.1, 25: 1.13, 30: 1.15, 31: 1.15, 32: 1.16, 33: 1.16, 35: 1.18, 37: 1.19 };
  function SG_NACLO2(c) { return SG_NACLO2_TABLE[c] !== undefined ? SG_NACLO2_TABLE[c] : interpTable(SG_NACLO2_TABLE, c); }
  function SG_HCL(c) { return SG_HCL_TABLE[c] !== undefined ? SG_HCL_TABLE[c] : interpTable(SG_HCL_TABLE, c); }
  function interpTable(table, x) {
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (x <= keys[0]) return table[keys[0]];
    if (x >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
    for (let i = 0; i < keys.length - 1; i++) {
      if (x >= keys[i] && x <= keys[i + 1]) {
        const t = (x - keys[i]) / (keys[i + 1] - keys[i]);
        return table[keys[i]] + t * (table[keys[i + 1]] - table[keys[i]]);
      }
    }
    return table[keys[keys.length - 1]];
  }

  /* [inches, NB mm, OD mm, Sch80 ID mm] */
  const PIPE_TABLE = [
    [0.5, 15, 21.3, 13.8],
    [0.75, 20, 26.7, 18.9],
    [1, 25, 33.4, 24.3],
    [1.25, 32, 42.2, 32.5],
    [1.5, 40, 48.3, 38.1],
    [2, 50, 60.3, 49.3],
    [2.5, 65, 73, 59],
    [3, 80, 88.9, 73.7],
    [4, 100, 114.3, 97.2],
    [5, 125, 141.3, 120.7],
    [6, 150, 168.3, 146.4],
    [8, 200, 219.1, 193.7],
    [10, 250, 273, 242.8],
    [12, 300, 323.8, 288.9],
    [14, 350, 355.6, 315.9],
    [16, 400, 406.4, 361.9],
    [18, 450, 457.2, 407.9],
    [20, 500, 508, 454],
    [24, 600, 610, 546],
  ];
  function PIPE_INCH(d) {
    if (d < 15) return 0.5;
    for (const row of PIPE_TABLE) if (row[1] >= d) return row[0];
    return PIPE_TABLE[PIPE_TABLE.length - 1][0];
  }
  function rowForInch(inch) {
    return PIPE_TABLE.find((r) => Math.abs(r[0] - inch) < 1e-6) || PIPE_TABLE[PIPE_TABLE.length - 1];
  }
  function NB_MM(inch) { return rowForInch(inch)[1]; }
  function OD_MM(inch) { return rowForInch(inch)[2]; }
  function ID_SCH80_MM(inch) { return rowForInch(inch)[3]; }
  function NEXT_NB_ABOVE(nb) {
    for (const row of PIPE_TABLE) if (row[1] > nb) return row[1];
    return "Above 600";
  }
  function CEILING(x, s) { return Math.ceil(x / s) * s; }
  function ROUNDUP(x, n) { const f = Math.pow(10, n); return Math.ceil(x * f - 1e-9) / f; }
  function frictionFactor(re) {
    if (re < 2100) return 64 / re;
    return 0.25 / Math.pow(Math.log10(5.74 / Math.pow(re, 0.9)), 2);
  }

  const G = 19.62; // 2 * 9.81, used throughout for V^2/2g head terms

  function npshAvail(atmHead, diff, friction, kLoss, duplicateDiff) {
    const inner = duplicateDiff ? diff + friction + kLoss : friction + kLoss;
    return atmHead + diff - 0.2 - (friction + inner);
  }

  function calculate() {
    try {
      const OUT = [];
      const card = (label, value, unit, flag, internal) => ({ label, value, unit: unit || "", flag, internal: Boolean(internal) });

      /* ---- Inputs shorthand ---- */
      const I_E5 = getNum("I_E5"), I_E6 = getNum("I_E6"), I_E7 = getNum("I_E7");
      const I_E8 = getNum("I_E8"), I_E8_UNIT = getText("I_E8_UNIT");
      const I_E9 = getNum("I_E9"), I_E10 = getNum("I_E10"), I_E11 = getNum("I_E11"), I_E12 = getNum("I_E12");
      const I_E14 = getNum("I_E14"), I_E15 = getNum("I_E15"), I_E16 = getNum("I_E16");
      const I_E18 = getNum("I_E18"), I_E19 = getNum("I_E19"), I_E20 = getNum("I_E20");
      const I_E23 = getNum("I_E23"), I_E24 = getNum("I_E24"), I_E25 = getNum("I_E25"), I_E26 = getNum("I_E26");
      const I_E28 = getNum("I_E28"), I_E29 = getNum("I_E29"), I_E30 = getNum("I_E30"), I_E31 = getNum("I_E31");
      const I_E35 = getText("I_E35"), I_E36 = getNum("I_E36");
      const I_E38 = getText("I_E38"), I_E39 = getNum("I_E39");
      const I_E43 = getNum("I_E43"), I_E44 = getNum("I_E44"), I_E45 = getNum("I_E45"), I_E46 = getNum("I_E46");
      const I_E48 = getNum("I_E48"), I_E49 = getNum("I_E49"), I_E50 = getNum("I_E50"), I_E51 = getNum("I_E51");
      const I_E55 = getNum("I_E55");
      const I_E60 = getNum("I_E60"), I_E61 = getNum("I_E61"), I_E62 = getNum("I_E62");
      const I_E65 = getNum("I_E65"), I_E66 = getNum("I_E66"), I_E67 = getNum("I_E67");
      const I_E68 = getText("I_E68"), I_E70 = getNum("I_E70"), I_E72 = getNum("I_E72"), I_E75 = getNum("I_E75");
      const I_E76 = getText("I_E76");

      const sgNaClO2 = SG_NACLO2(I_E10);
      const sgHCl = SG_HCL(I_E11);

      if (I_E9 <= 0) throw new Error("Operating time must be greater than 0");
      if (I_E10 <= 0 || I_E11 <= 0) throw new Error("NaClO2 and HCl concentration must be greater than 0");

      /* =====================================================================
         OUTPUT DATAS
      ===================================================================== */
      const T_E4 = getNum("T_E4");
      if (T_E4 <= 0) throw new Error("System Efficiency must be greater than 0");
      const chlorineDosed = I_E6 + I_E7;
      // ClO2 required (Calculation!F22, kg/hr), then divided by system
      // efficiency (F23/100) since the generator only converts part of what
      // it's fed. Small duties (<=1 kg/hr) round to 2 decimals (effectively
      // the next 10 g/hr once displayed in g/hr); larger duties round to the
      // next whole kg/hr (Calculation!F24).
      const clo2Required = (I_E5 * chlorineDosed) / 1000;
      // g/hr vs kg/hr flag: based on the water-duty requirement itself
      // (Calculation!F22), not on any client-stated override below — matches
      // the source workbook's Units flag definition.
      const isGramsSystem = clo2Required <= 1;
      const calculatedCapacity = isGramsSystem ? ROUNDUP(clo2Required / (T_E4 / 100), 2) : ROUNDUP(clo2Required / (T_E4 / 100), 0);
      // Client-stated capacity (I_E8), if entered, overrides the water-duty
      // calculation — mirrors the source workbook's Questionnaire!C25 ->
      // Calculation!F7 priority (use the client figure when given, else the
      // calculated one).
      const clientStatedCapacityKgHr = I_E8 > 0 ? (I_E8_UNIT === "g/hr" ? I_E8 / 1000 : I_E8) : 0;
      const systemCapacity = clientStatedCapacityKgHr > 0 ? clientStatedCapacityKgHr : calculatedCapacity;
      const systemCapacityGHr = systemCapacity * 1000;
      OUT.push({
        title: "Output Datas",
        cards: [
          card("Water Treated", I_E5, "m3/hr"),
          card("ClO2 Required", clo2Required.toFixed(4), "Kg/hr"),
          card("System Efficiency", T_E4, "%"),
          card("System Capacity", systemCapacity, "Kg/hr"),
          card("System Capacity", systemCapacityGHr.toFixed(2), "g/hr"),
          card("System Capacity Basis", clientStatedCapacityKgHr > 0 ? "Client-Stated (Override)" : "Calculated from Water Duty", ""),
          card("Chlorine Dosed", chlorineDosed, "ppm"),
          card("Output dosing", getNum("T_E343"), "ppm"),
          card("Operating time", I_E9, "hrs"),
          card("Sodium Chlorite (NaClO2) Concentration", I_E10, "%"),
          card("Hydrochloric Acid (HCl) Concentration", I_E11, "%"),
        ],
      });

      /* =====================================================================
         FEED REQUIREMENT
      ===================================================================== */
      // These two feed-rate constants were previously baked in as if the
      // plant always ran at a fixed 330 kg/hr (553.0985915 = 330 x the
      // NaClO2:ClO2 stoich ratio, 178.5767235 = 330 x the HCl:ClO2 ratio) —
      // completely bypassing systemCapacity above. Rebased on systemCapacity
      // so the actual sized capacity (water-duty calculated, or client
      // override) now drives chemical feed rate as it should.
      const naclo2LPH = (553.0985915 / 330) * systemCapacity / (I_E10 / 100) / sgNaClO2;
      const hclLPH = (178.5767235 / 330) * systemCapacity * I_E12 / (I_E11 / 100) / sgHCl;
      const naclo2PerDay = naclo2LPH * I_E9;
      const hclPerDay = hclLPH * I_E9;
      OUT.push({
        title: "Feed Requirement",
        cards: [
          card("Sodium Chlorite (NaClO2)", naclo2LPH.toFixed(4), "LPH"),
          card("Hydrochloric Acid (HCl)", hclLPH.toFixed(4), "LPH"),
          card("Sodium Chlorite (NaClO2)", naclo2PerDay.toFixed(4), "Per day (ltrs)"),
          card("Hydrochloric Acid (HCl)", hclPerDay.toFixed(4), "Per day (ltrs)"),
        ],
      });

      /* =====================================================================
         MOTIVE WATER REQUIREMENT
      ===================================================================== */
      const T_E343 = getNum("T_E343"), T_E344 = getNum("T_E344"), T_E345 = getNum("T_E345");
      // Same fixed-330-kg/hr bug as the feed-rate constants above
      // (330000 = 330 kg/hr expressed in g/hr) — rebased on systemCapacity.
      const motiveWaterM3hr = (systemCapacity * 1000) / (T_E343 / 1000) / 1000;
      OUT.push({
        title: "Motive Water Requiremnt",
        cards: [card("Motive Water Required", motiveWaterM3hr.toFixed(4), "m3/hr")],
      });

      /* Shared pipe-sizing helper: velocity(m/s), flow(m3/s) -> {inch, idM} */
      function sizeLine(flowM3s, velocity) {
        const inch = PIPE_INCH(Math.sqrt(((flowM3s * 4) / (velocity * Math.PI))) * 1000);
        const idM = ID_SCH80_MM(inch) / 1000;
        return { inch, idM };
      }
      function reynolds(sg, velocity, idM, viscosity) {
        return (sg * 1000 * velocity * idM) / viscosity;
      }
      const VISC_NACLO2 = 0.0025, VISC_HCL = 0.0018, VISC_WATER = 0.001;

      /* Generic segment head-loss: friction + minor-loss, in metres. */
      function segLoss(flowM3s, velocity, lengthM, kSumTerm, sg, visc) {
        const idM = ID_SCH80_MM(PIPE_INCH(Math.sqrt((flowM3s * 4) / (velocity * Math.PI)) * 1000)) / 1000;
        const vel = flowM3s / ((Math.PI * idM * idM) / 4);
        const re = reynolds(sg, vel, idM, visc);
        const f = frictionFactor(re);
        return f * (lengthM / idM) * ((vel * vel) / G) + kSumTerm * ((vel * vel) / G);
      }
      function lineInch(flowM3s, velocity) {
        return PIPE_INCH(Math.sqrt((flowM3s * 4) / (velocity * Math.PI)) * 1000);
      }

      /* Generic PP+FRP shell/bottom thickness (reused by every tank). */
      function tankThickness(designPressureBar, radiusM, stressPP, stressFRP, jointFRP) {
        const num = designPressureBar * 100000 * radiusM * 1000;
        const pp = Math.max(2, CEILING(Math.max(num / (stressPP * 1e6 - 0.6 * designPressureBar * 100000), 4), 2));
        const frp = Math.max(2, CEILING(Math.max(num / (stressFRP * 1e6 * jointFRP - 0.6 * designPressureBar * 100000), 3), 2));
        return { pp, frp, total: pp + frp, ppBottom: CEILING(pp * 1.2, 2), frpBottom: CEILING(frp * 1.2, 2), totalBottom: CEILING(pp * 1.2, 2) + CEILING(frp * 1.2, 2) };
      }

      /* =====================================================================
         UNLOADING PUMP
      ===================================================================== */
      const T_E7 = getNum("T_E7"), T_E9 = getNum("T_E9"), T_E10 = getNum("T_E10");
      const T_E26 = getNum("T_E26"), T_E28 = getNum("T_E28"), T_E29 = getNum("T_E29");

      const flowUPN = ((naclo2LPH * I_E9 * I_E14) / I_E15) * ((100 + T_E7) / 100) / I_E23 / 3600000;
      const flowUPH = ((hclLPH * I_E9 * I_E18) / I_E19) * ((100 + T_E26) / 100) / I_E28 / 3600000;
      const pumpCapUPN = ROUNDUP(flowUPN * 3600 * 1.15, 0);
      const pumpCapUPH = ROUNDUP(flowUPH * 3600 * 1.15, 0);

      const T_E46 = getNum("T_E46"), T_E47 = getNum("T_E47"), T_E48v = getNum("T_E48");
      const T_E78 = getNum("T_E78"), T_E79 = getNum("T_E79"), T_E80 = getNum("T_E80");
      const T_E62 = getNum("T_E62"), T_E94 = getNum("T_E94");
      const T_E60 = getNum("T_E60"), T_E92 = getNum("T_E92");
      const T_E75 = getNum("T_E75"), T_E107 = getNum("T_E107");

      const kSuctionUPN = minorLossSum("UPN_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kDischargeUPN = minorLossSum("UPN_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kSuctionUPH = minorLossSum("UPH_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kDischargeUPH = minorLossSum("UPH_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);

      function segParts(flow, velocity, length, kSum, sg, visc) {
        const idM = ID_SCH80_MM(PIPE_INCH(Math.sqrt((flow * 4) / (velocity * Math.PI)) * 1000)) / 1000;
        const vel = flow / ((Math.PI * idM * idM) / 4);
        const re = reynolds(sg, vel, idM, visc);
        const friction = frictionFactor(re) * (length / idM) * ((vel * vel) / G);
        const kTerm = kSum * ((vel * vel) / G);
        return { friction, kTerm, total: friction + kTerm };
      }

      const upnSuc = segParts(flowUPN, T_E46, I_E25, kSuctionUPN, sgNaClO2, VISC_NACLO2);
      const uphSuc = segParts(flowUPH, T_E78, I_E30, kSuctionUPH, sgHCl, VISC_HCL);
      const upnDis = segParts(flowUPN, T_E62, I_E26, kDischargeUPN, sgNaClO2, VISC_NACLO2);
      const uphDis = segParts(flowUPH, T_E94, I_E31, kDischargeUPH, sgHCl, VISC_HCL);

      const npshAvailUPN = npshAvail(10.33, T_E47 - T_E48v, upnSuc.friction, upnSuc.kTerm, false);
      const npshAvailUPH = npshAvail(10.33, T_E79 - T_E80, uphSuc.friction, uphSuc.kTerm, true);
      const npshSafetyUPN = npshAvailUPN - T_E60;
      const npshSafetyUPH = npshAvailUPH - T_E92;

      /* Destination tank heights (bulk storage tank) needed for TDH — computed
         here first since the Bulk Storage Tank section below reuses them too.
         NOTE: this chain (tank sizing) does NOT divide by filling time — that
         only applies to the pump/line-size/NPSH chain (flowUPN/flowUPH above),
         which is a materially different quantity despite the shared inputs. */
      const bulkChainNaClO2 = ((naclo2LPH * I_E9 * I_E14) / I_E15) * ((100 + T_E7) / 100);
      const bulkChainHCl = ((hclLPH * I_E9 * I_E18) / I_E19) * ((100 + T_E26) / 100);
      const bulkDiaCubeNaClO2 = Math.pow((CEILING(bulkChainNaClO2, 500) / 1000 * 4) / (Math.PI * T_E9), 1 / 3);
      const bulkDiaCubeHCl = Math.pow((CEILING(bulkChainHCl, 500) / 1000 * 4) / (Math.PI * T_E28), 1 / 3);
      const bulkHRawNaClO2 = bulkDiaCubeNaClO2 * 1.5;
      const bulkHRawHCl = bulkDiaCubeHCl * 1.5;
      const bulkDiaNaClO2 = CEILING(bulkDiaCubeNaClO2 * 1000, 50) / 1000;
      const bulkDiaHCl = CEILING(bulkDiaCubeHCl * 1000, 50) / 1000;
      const bulkHeightNaClO2 = (CEILING(bulkHRawNaClO2 * 1000, 50) + CEILING(bulkHRawNaClO2 * (T_E10 / 100) * 1000, 50)) / 1000;
      const bulkHeightHCl = (CEILING(bulkHRawHCl * 1000, 50) + CEILING(bulkHRawHCl * (T_E29 / 100) * 1000, 50)) / 1000;

      const tdhUPN = (bulkHeightNaClO2 + 0.3 - (T_E47 - T_E48v) + upnSuc.total + upnDis.total) * (T_E75 / 100 + 1);
      const tdhUPH = (bulkHeightHCl + 0.3 - (T_E79 - T_E80) + uphSuc.total + uphDis.total) * (T_E107 / 100 + 1);

      OUT.push({
        title: "Unloading Pump",
        cards: [
          card("Pump Capacity (NaClO2)", pumpCapUPN, "m3/hr"),
          card("Pump Capacity (HCl)", pumpCapUPH, "m3/hr"),
          card("Line Size Suction (NaClO2)", lineInch(flowUPN, T_E46), "inch"),
          card("Line Size Suction (HCl)", lineInch(flowUPH, T_E78), "inch"),
          card("NPSH Required (NaClO2)", T_E60, "m", "", true),
          card("NPSH Required (HCl)", T_E92, "m", "", true),
          card("NPSH Available (NaClO2)", npshAvailUPN.toFixed(4), "m", "", true),
          card("NPSH Available (HCl)", npshAvailUPH.toFixed(4), "m", "", true),
          card("NPSH Safety (NaClO2)", npshSafetyUPN.toFixed(4), "m", "", true),
          card("NPSH Safety (HCl)", npshSafetyUPH.toFixed(4), "m", "", true),
          card("NPSH Safety Check (NaClO2)", npshAvailUPN > T_E60 + 1 ? "SAFE" : "CHECK NPSH", "", npshAvailUPN > T_E60 + 1 ? "safe" : "warn", true),
          card("NPSH Safety Check (HCl)", npshAvailUPH > T_E92 + 1 ? "SAFE" : "CHECK NPSH", "", npshAvailUPH > T_E92 + 1 ? "safe" : "warn", true),
          card("Line Size Discharge (NaClO2)", lineInch(flowUPN, T_E62), "inch"),
          card("Line Size Discharge (HCl)", lineInch(flowUPH, T_E94), "inch"),
          card("Total Dynamic Head (NaClO2)", tdhUPN.toFixed(4), "m"),
          card("Total Dynamic Head (HCl)", tdhUPH.toFixed(4), "m"),
        ],
      });

      /* =====================================================================
         BULK STORAGE TANK REQUIREMENT (KL)
      ===================================================================== */
      const T_E13 = getNum("T_E13"), T_E15 = getNum("T_E15"), T_E19 = getNum("T_E19"), T_E20 = getNum("T_E20");
      const T_E32 = getNum("T_E32"), T_E34 = getNum("T_E34"), T_E38 = getNum("T_E38"), T_E39 = getNum("T_E39");
      const bulkCapNaClO2KL = naclo2PerDay * I_E14 / 1000;
      const bulkCapHClKL = hclPerDay * I_E18 / 1000;
      const bulkCalcVolNaClO2 = (Math.PI * Math.pow(bulkDiaNaClO2, 2) * bulkHeightNaClO2) / 4;
      const bulkCalcVolHCl = (Math.PI * Math.pow(bulkDiaHCl, 2) * bulkHeightHCl) / 4;
      const bulkAdeqNaClO2 = (bulkCalcVolNaClO2 * 1000) / bulkChainNaClO2;
      const bulkAdeqHCl = (bulkCalcVolHCl * 1000) / bulkChainHCl;
      const bulkDesignPNaClO2 = (sgNaClO2 * 1000 * 9.81 * bulkHRawNaClO2) / 100000 * 2;
      const bulkDesignPHCl = (sgHCl * 1000 * 9.81 * bulkHRawHCl) / 100000 * T_E32;
      const bulkThkNaClO2 = tankThickness(bulkDesignPNaClO2, bulkDiaNaClO2 / 2, T_E15, T_E19, T_E20);
      const bulkThkHCl = tankThickness(bulkDesignPHCl, bulkDiaHCl / 2, T_E34, T_E38, T_E39);

      OUT.push({
        title: "Bulk Storage Tank Requirement (KL)",
        cards: [
          card("NaClO2 Storage Days", I_E14, "Days"),
          card("HCl Storage Days", I_E18, "Days"),
          card("NaClO2 Bulk Storage Tank Capacity", bulkCapNaClO2KL.toFixed(4), "KL"),
          card("HCl Bulk Storage Tank Capacity", bulkCapHClKL.toFixed(4), "KL"),
          card("No.of Tanks (NaClO2)", I_E15, "Tanks"),
          card("No.of Tanks (HCl)", I_E19, "Tanks"),
          card("Tank Volume (NaClO2)", CEILING(bulkChainNaClO2, 500) / 1000, "m3"),
          card("Tank Volume (HCl)", CEILING(bulkChainHCl, 500) / 1000, "m3"),
          card("Diameter (NaClO2)", bulkDiaNaClO2, "m", "", true),
          card("Diameter (HCl)", bulkDiaHCl, "m", "", true),
          card("Height (NaClO2)", bulkHeightNaClO2, "m", "", true),
          card("Height (HCl)", bulkHeightHCl, "m", "", true),
          card("Calculated Volume (NaClO2)", bulkCalcVolNaClO2.toFixed(4), "m3", "", true),
          card("Calculated Volume (HCl)", bulkCalcVolHCl.toFixed(4), "m3", "", true),
          card("Adequacy Ratio (NaClO2)", bulkAdeqNaClO2.toFixed(4), "", "", true),
          card("Adequacy Ratio (HCl)", bulkAdeqHCl.toFixed(4), "", "", true),
          card("Adequacy Status (NaClO2)", bulkAdeqNaClO2 >= 1 ? "OK" : "UNDERSIZED", "", bulkAdeqNaClO2 >= 1 ? "safe" : "warn", true),
          card("Adequacy Status (HCl)", bulkAdeqHCl >= 1 ? "OK" : "UNDERSIZED", "", bulkAdeqHCl >= 1 ? "safe" : "warn", true),
          card("Design Pressure Hydrostatic (NaClO2)", bulkDesignPNaClO2.toFixed(4), "Bar", "", true),
          card("Design Pressure Hydrostatic (HCl)", bulkDesignPHCl.toFixed(4), "Bar", "", true),
          card("Final PP Inner Layer (NaClO2)", bulkThkNaClO2.pp, "mm", "", true),
          card("Final PP Inner Layer (HCl)", bulkThkHCl.pp, "mm", "", true),
          card("Final FRP Outer Layer (NaClO2)", bulkThkNaClO2.frp, "mm", "", true),
          card("Final FRP Outer Layer (HCl)", bulkThkHCl.frp, "mm", "", true),
          card("Final Total Shell Thickness (NaClO2)", bulkThkNaClO2.total, "mm", "", true),
          card("Final Total Shell Thickness (HCl)", bulkThkHCl.total, "mm", "", true),
          card("PP Bottom Thickness (NaClO2)", bulkThkNaClO2.ppBottom, "mm", "", true),
          card("PP Bottom Thickness (HCl)", bulkThkHCl.ppBottom, "mm", "", true),
          card("FRP Bottom Thickness (NaClO2)", bulkThkNaClO2.frpBottom, "mm", "", true),
          card("FRP Bottom Thickness (HCl)", bulkThkHCl.frpBottom, "mm", "", true),
          card("Total Bottom Thickness (NaClO2)", bulkThkNaClO2.totalBottom, "mm", "", true),
          card("Total Bottom Thickness (HCl)", bulkThkHCl.totalBottom, "mm", "", true),
          card("Level Sensor Nozzle (NaClO2)", getNum("T_E23"), "NB", "", true),
          card("Level Sensor Nozzle (HCl)", getNum("T_E42"), "NB", "", true),
        ],
      });

      /* =====================================================================
         MEASURING TANK — volume/diameter/height (needed for Transfer Pump TDH)
      ===================================================================== */
      const T_E113 = getNum("T_E113"), T_E115 = getNum("T_E115"), T_E116 = getNum("T_E116"), T_E119 = getNum("T_E119");
      const T_E121 = getNum("T_E121"), T_E125 = getNum("T_E125"), T_E126 = getNum("T_E126");
      const T_E153 = getNum("T_E153"), T_E156 = getNum("T_E156"), T_E157 = getNum("T_E157");
      const T_E162 = getNum("T_E162"), T_E166 = getNum("T_E166"), T_E167 = getNum("T_E167");

      const measuringVolNaClO2 = CEILING(naclo2LPH * I_E36 * ((100 + T_E113) / 100), 500) / 1000;
      const measuringVolHCl = CEILING(hclLPH * I_E39 * ((100 + T_E153) / 100), 500) / 1000;
      const measDiaCubeNaClO2 = Math.pow((measuringVolNaClO2 * 4) / (Math.PI * T_E115), 1 / 3);
      const measDiaCubeHCl = Math.pow((measuringVolHCl * 4) / (Math.PI * T_E156), 1 / 3);
      const measHRawNaClO2 = measDiaCubeNaClO2 * 1.5;
      const measHRawHCl = measDiaCubeHCl * 1.5;
      const measDiaNaClO2 = CEILING(measDiaCubeNaClO2 * 1000, 50) / 1000;
      const measDiaHCl = CEILING(measDiaCubeHCl * 1000, 50) / 1000;
      const measHeightNaClO2 = (CEILING(measHRawNaClO2 * 1000, 50) + CEILING(measHRawNaClO2 * (T_E116 / 100) * 1000, 50)) / 1000;
      const measHeightHCl = (CEILING(measHRawHCl * 1000, 50) + CEILING(measHRawHCl * (T_E157 / 100) * 1000, 50)) / 1000;
      const measCalcVolNaClO2 = (Math.PI * Math.pow(measDiaNaClO2, 2) * measHeightNaClO2) / 4;
      const measCalcVolHCl = (Math.PI * Math.pow(measDiaHCl, 2) * measHeightHCl) / 4;
      const measAdeqNaClO2 = (measCalcVolNaClO2 * 1000) / (naclo2LPH * I_E36 * ((100 + T_E113) / 100));
      const measAdeqHCl = (measCalcVolHCl * 1000) / (hclLPH * I_E39 * ((100 + T_E153) / 100));
      const measDesignPNaClO2 = (sgNaClO2 * 1000 * 9.81 * measHRawNaClO2) / 100000 * T_E119;
      const measDesignPHCl = (sgHCl * 1000 * 9.81 * measHRawHCl) / 100000 * 2;
      const measThkNaClO2 = tankThickness(measDesignPNaClO2, measDiaNaClO2 / 2, T_E121, T_E125, T_E126);
      const measThkHCl = tankThickness(measDesignPHCl, measDiaHCl / 2, T_E162, T_E166, T_E167);

      /* =====================================================================
         TRANSFER PUMP
      ===================================================================== */
      const T_E211 = getNum("T_E211"), T_E212 = getNum("T_E212"), T_E213 = getNum("T_E213");
      const T_E243 = getNum("T_E243"), T_E244 = getNum("T_E244"), T_E245 = getNum("T_E245");
      const T_E227 = getNum("T_E227"), T_E259 = getNum("T_E259");
      const T_E225 = getNum("T_E225"), T_E257 = getNum("T_E257");
      const T_E240 = getNum("T_E240"), T_E272 = getNum("T_E272");

      const flowTPN = measuringVolNaClO2 / (I_E43 / 60) / 3600;
      const flowTPH = measuringVolHCl / (I_E48 / 60) / 3600;
      const pumpCapTPN = ROUNDUP((measuringVolNaClO2 / (I_E43 / 60)) * 1.15, 0);
      const pumpCapTPH = ROUNDUP((measuringVolHCl / (I_E48 / 60)) * 1.15, 0);

      const kSuctionTPN = minorLossSum("TPN_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kDischargeTPN = minorLossSum("TPN_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kSuctionTPH = minorLossSum("TPH_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["DV_OPEN", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kDischargeTPH = minorLossSum("TPH_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);

      const tpnSuc = segParts(flowTPN, T_E211, I_E45, kSuctionTPN, sgNaClO2, VISC_NACLO2);
      const tphSuc = segParts(flowTPH, T_E243, I_E50, kSuctionTPH, sgHCl, VISC_HCL);
      const tpnDis = segParts(flowTPN, T_E227, I_E46, kDischargeTPN, sgNaClO2, VISC_NACLO2);
      const tphDis = segParts(flowTPH, T_E259, I_E51, kDischargeTPH, sgHCl, VISC_HCL);

      const npshAvailTPN = npshAvail(10.33, T_E212 - T_E213, tpnSuc.friction, tpnSuc.kTerm, false);
      const npshAvailTPH = npshAvail(10.33, T_E244 - T_E245, tphSuc.friction, tphSuc.kTerm, true);
      const npshSafetyTPN = npshAvailTPN - T_E225;
      const npshSafetyTPH = npshAvailTPH - T_E257;

      const tdhTPN = ROUNDUP((measHeightNaClO2 + 0.3 - (T_E212 - T_E213) + tpnSuc.total + tpnDis.total) * (T_E240 / 100 + 1), 0);
      const tdhTPH = ROUNDUP((measHeightHCl + 0.3 - (T_E244 - T_E245) + tphSuc.total + tphDis.total) * (T_E272 / 100 + 1), 0);

      OUT.push({
        title: "Transfer Pump",
        cards: [
          card("Pump Capacity (NaClO2)", pumpCapTPN, "m3/hr"),
          card("Pump Capacity (HCl)", pumpCapTPH, "m3/hr"),
          card("Line Size Suction (NaClO2)", lineInch(flowTPN, T_E211), "inch"),
          card("Line Size Suction (HCl)", lineInch(flowTPH, T_E243), "inch"),
          card("NPSH Required (NaClO2)", T_E225, "m", "", true),
          card("NPSH Required (HCl)", T_E257, "m", "", true),
          card("NPSH Available (NaClO2)", npshAvailTPN.toFixed(4), "m", "", true),
          card("NPSH Available (HCl)", npshAvailTPH.toFixed(4), "m", "", true),
          card("NPSH Safety (NaClO2)", npshSafetyTPN.toFixed(4), "m", "", true),
          card("NPSH Safety (HCl)", npshSafetyTPH.toFixed(4), "m", "", true),
          card("NPSH Safety Check (NaClO2)", npshAvailTPN > T_E225 + 1 ? "SAFE" : "CHECK NPSH", "", npshAvailTPN > T_E225 + 1 ? "safe" : "warn", true),
          card("NPSH Safety Check (HCl)", npshAvailTPH > T_E257 + 1 ? "SAFE" : "CHECK NPSH", "", npshAvailTPH > T_E257 + 1 ? "safe" : "warn", true),
          card("Line Size Discharge (NaClO2)", lineInch(flowTPN, T_E227), "inch"),
          card("Line Size Discharge (HCl)", lineInch(flowTPH, T_E259), "inch"),
          card("Total Dynamic Head (NaClO2)", tdhTPN, "m"),
          card("Total Dynamic Head (HCl)", tdhTPH, "m"),
        ],
      });

      /* =====================================================================
         MEASURING TANK (output section)
      ===================================================================== */
      OUT.push({
        title: "Measuring Tank",
        cards: [
          card("Autonomy hours (NaClO2)", I_E36, "hrs/day"),
          card("Autonomy hours (HCl)", I_E39, "hrs/day"),
          card("Tank Volume (NaClO2)", measuringVolNaClO2, "m3"),
          card("Tank Volume (HCl)", measuringVolHCl, "m3"),
          card("Tank Type (NaClO2)", I_E35),
          card("Tank Type (HCl)", I_E38),
          card("Diameter (NaClO2)", measDiaNaClO2, "m", "", true),
          card("Diameter (HCl)", measDiaHCl, "m", "", true),
          card("Height (NaClO2)", measHeightNaClO2, "m", "", true),
          card("Height (HCl)", measHeightHCl, "m", "", true),
          card("Calculated Volume (NaClO2)", measCalcVolNaClO2.toFixed(4), "m3", "", true),
          card("Calculated Volume (HCl)", measCalcVolHCl.toFixed(4), "m3", "", true),
          card("Adequacy Ratio (NaClO2)", measAdeqNaClO2.toFixed(4), "", "", true),
          card("Adequacy Ratio (HCl)", measAdeqHCl.toFixed(4), "", "", true),
          card("Adequacy Status (NaClO2)", measAdeqNaClO2 >= 1 ? "OK" : "UNDERSIZED", "", measAdeqNaClO2 >= 1 ? "safe" : "warn", true),
          card("Adequacy Status (HCl)", measAdeqHCl >= 1 ? "OK" : "UNDERSIZED", "", measAdeqHCl >= 1 ? "safe" : "warn", true),
          card("Design Pressure Hydrostatic (NaClO2)", measDesignPNaClO2.toFixed(4), "Bar", "", true),
          card("Design Pressure Hydrostatic (HCl)", measDesignPHCl.toFixed(4), "Bar", "", true),
          card("Final PP Inner Layer (NaClO2)", measThkNaClO2.pp, "mm", "", true),
          card("Final PP Inner Layer (HCl)", measThkHCl.pp, "mm", "", true),
          card("Final FRP Outer Layer (NaClO2)", measThkNaClO2.frp, "mm", "", true),
          card("Final FRP Outer Layer (HCl)", measThkHCl.frp, "mm", "", true),
          card("Final Total Shell Thickness (NaClO2)", measThkNaClO2.total, "mm", "", true),
          card("Final Total Shell Thickness (HCl)", measThkHCl.total, "mm", "", true),
          card("PP Bottom Thickness (NaClO2)", measThkNaClO2.ppBottom, "mm", "", true),
          card("PP Bottom Thickness (HCl)", measThkHCl.ppBottom, "mm", "", true),
          card("FRP Bottom Thickness (NaClO2)", measThkNaClO2.frpBottom, "mm", "", true),
          card("FRP Bottom Thickness (HCl)", measThkHCl.frpBottom, "mm", "", true),
          card("Total Bottom Thickness (NaClO2)", measThkNaClO2.totalBottom, "mm", "", true),
          card("Total Bottom Thickness (HCl)", measThkHCl.totalBottom, "mm", "", true),
          card("Level Sensor Nozzle (NaClO2)", getNum("T_E129"), "NB", "", true),
          card("Level Sensor Nozzle (HCl)", getNum("T_E170"), "NB", "", true),
          card("Level Gauge Top (NaClO2)", getNum("T_E130"), "NB", "", true),
          card("Level Gauge Top (HCl)", getNum("T_E171"), "NB", "", true),
          card("Level Gauge Bottom (NaClO2)", getNum("T_E131"), "NB", "", true),
          card("Level Gauge Bottom (HCl)", getNum("T_E172"), "NB", "", true),
        ],
      });

      /* =====================================================================
         FUME ABSORBERS (HCl bulk storage tank + HCl measuring tank)
      ===================================================================== */
      function fumeAbsorber(flowLPH, breathingPct, gasVel, hd) {
        const dia = Math.max(300, Math.sqrt((4 * ((flowLPH / 1000) * (1 + breathingPct / 100))) / (3600 * gasVel) / Math.PI) * 1000) / 1000;
        const height = hd * dia * 1.2;
        const volume = Math.ceil(Math.PI * Math.pow(dia / 2, 2) * height * 1000);
        return { dia, height, volume };
      }
      const T_E194 = getNum("T_E194"), T_E196 = getNum("T_E196"), T_E197 = getNum("T_E197");
      const T_E201 = getNum("T_E201"), T_E203 = getNum("T_E203"), T_E204 = getNum("T_E204");
      const fumeBulk = fumeAbsorber(hclLPH, T_E194, T_E196, T_E197);
      const fumeMeas = fumeAbsorber(hclLPH, T_E201, T_E203, T_E204);
      OUT.push({
        title: "Fume Absorbers (HCl)",
        cards: [
          card("Volume (HCl Bulk Storage Tank)", fumeBulk.volume, "Litres"),
          card("Diameter (HCl Bulk Storage Tank)", fumeBulk.dia.toFixed(3), "m"),
          card("Total Height (HCl Bulk Storage Tank)", fumeBulk.height.toFixed(4), "m"),
          card("Volume (HCl Measuring Tank)", fumeMeas.volume, "Litres"),
          card("Diameter (HCl Measuring Tank)", fumeMeas.dia.toFixed(3), "m"),
          card("Total Height (HCl Measuring Tank)", fumeMeas.height.toFixed(4), "m"),
        ],
      });

      /* =====================================================================
         SHARED HYDRAULICS — motive water / booster pump / reactor chain.
         Variable names (step1..step30) mirror the PDF's own Step1..Step30
         table for "Discharge Pressure NaClO2" (Input!K121) verbatim, since
         this is the single most convoluted formula in the source document
         and several other outputs (Reactor Q/Volume/Diameter/Height, Booster
         Pump Yes/No, Motive Water line sizes) reuse these same steps.
      ===================================================================== */
      const T_E293 = getNum("T_E293"), T_E294 = getNum("T_E294"), T_E295 = getNum("T_E295"), T_E307 = getNum("T_E307");
      const T_E277 = getNum("T_E277"), T_E278 = getNum("T_E278"), T_E279 = getNum("T_E279"), T_E291 = getNum("T_E291");
      const T_E362 = getNum("T_E362"), T_E363 = getNum("T_E363"), T_E364 = getNum("T_E364"), T_E379 = getNum("T_E379");
      const T_E393 = getNum("T_E393"), T_E395 = getNum("T_E395"), T_E397 = getNum("T_E397"), T_E398 = getNum("T_E398");
      const T_E399 = getNum("T_E399"), T_E401 = getNum("T_E401"), T_E402 = getNum("T_E402");
      const T_E406 = getNum("T_E406"), T_E407 = getNum("T_E407"), T_E408 = getNum("T_E408"), T_E409 = getNum("T_E409");
      const T_E414 = getNum("T_E414"), T_E415 = getNum("T_E415"), T_E416 = getNum("T_E416"), T_E417 = getNum("T_E417"), T_E418 = getNum("T_E418");
      const T_E427 = getNum("T_E427"), T_E430 = getNum("T_E430"), T_E431 = getNum("T_E431"), T_E432 = getNum("T_E432");
      const T_E376 = getNum("T_E376");

      const kMW = 3 * getNum("MW_DV_1") + 3 * getNum("MW_DV_2") + 3 * getNum("MW_CV_1") + 3 * getNum("MW_CV_2") + 2 * getNum("MW_YS") + 3 * getNum("MW_FM");
      const T_E357 = getNum("T_E357");
      const kBoosterSuc = minorLossSum("BP_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kBoosterDis = minorLossSum("BP_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kReactorOutlet = minorLossSum("RX_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kDPNSuc = minorLossSum("DPN_S", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 1], ["YS_CLEAN", 1], ["CC_PVDF", 1], ["PRV_OPEN", 0], ["PD_STANDARD", 0], ["FM_ROTA", 0]]);
      const kDPNDis = minorLossSum("DPN_D", [["DV_OPEN", 1], ["DV_OPEN", 1], ["CV_SWING", 1], ["CV_SWING", 0], ["YS_CLEAN", 0], ["CC_PVDF", 0], ["PRV_OPEN", 1], ["PD_STANDARD", 1], ["FM_ROTA", 1]]);

      const motiveWaterM3s = motiveWaterM3hr / 3600;
      const step1 = ID_SCH80_MM(PIPE_INCH(Math.sqrt((motiveWaterM3s * 4) / (1.5 * Math.PI)) * 1000)) / 1000;
      const step2 = ID_SCH80_MM(PIPE_INCH(Math.sqrt((motiveWaterM3s * 4) / (T_E362 * Math.PI)) * 1000)) / 1000;
      const step3 = ID_SCH80_MM(PIPE_INCH(Math.sqrt((motiveWaterM3s * 4) / (T_E345 * Math.PI)) * 1000)) / 1000;
      const flowDPN = naclo2LPH / 3600000;
      const flowDPH = hclLPH / 3600000;
      const step4b = ID_SCH80_MM(PIPE_INCH(Math.sqrt((flowDPN * 4) / (0.5 * Math.PI)) * 1000)) / 1000;
      const step5 = ID_SCH80_MM(PIPE_INCH(Math.sqrt((flowDPN * 4) / (T_E277 * Math.PI)) * 1000)) / 1000;
      const step6 = motiveWaterM3hr + hclLPH / 1000 + naclo2LPH / 1000; // Q,Total
      const step7 = motiveWaterM3s / ((Math.PI * step1 * step1) / 4);
      const step8 = step7 * step7;
      const step9 = step6 * 1000 / 3600000; // Q,Total in m3/s
      // Reactor residence time: g/hr (small) systems now always use 45s
      // regardless of what's typed in T_E394; kg/hr systems use the
      // Technical Input field (default 30s). 0.008333333333 = 30/3600.
      const residenceTimeSec = isGramsSystem ? 45 : getNum("T_E394");
      const step10 = step6 * (residenceTimeSec / 3600);
      const step11 = motiveWaterM3s / ((Math.PI * step2 * step2) / 4);
      const step12 = motiveWaterM3s / ((Math.PI * step3 * step3) / 4);
      const step13 = step11 * step11;
      const step14 = step12 * step12;
      const step15 = flowDPN / ((Math.PI * step4b * step4b) / 4);
      const step16 = step15 * step15;
      const step17 = Math.pow((step10 * 4) / (T_E397 * Math.PI), 1 / 3);
      const step18 = flowDPN / ((Math.PI * step5 * step5) / 4);
      const step19 = step18 * step18;
      const step20 = T_E397 * step17;
      const step21 = ID_SCH80_MM(PIPE_INCH(Math.sqrt((step9 * 4) / (T_E393 * Math.PI)) * 1000)) / 1000;
      const step22 = (T_E344 * 1000 * step7 * step1) / 0.001;
      const step23 = (T_E344 * 1000 * step11 * step2) / 0.001;
      const step24r = (T_E344 * 1000 * step12 * step3) / 0.001;
      const step25 = (sgNaClO2 * 1000 * step15 * step4b) / 0.0025;
      const step26 = (sgNaClO2 * 1000 * step18 * step5) / 0.0025;
      const step27 = ROUNDUP(step20 + (T_E398 / 100) * step20, 1);
      const step28 = (1000 * (step9 / ((Math.PI * step21 * step21) / 4)) * step21) / 0.001;
      const step17r1 = ROUNDUP(step17, 1);
      const step29 = (150 * T_E427 * ((4 * (((100 + T_E395) / 100) * step10 * 0.6)) / (Math.PI * step17r1 * step17r1)) * 0.02 * 0.36) / (step17 * step17 * 0.064 * 100000);

      const sumpTerm = (I_E70 * 1000 * 9.81) / 100000 + 0.2;
      const step30 =
        ((9810 *
          (I_E67 +
            frictionFactor(step28) * (I_E66 / step21) * ((sumpTerm * sumpTerm) / G) +
            kReactorOutlet * ((sumpTerm * sumpTerm) / G))) /
          100000 +
          sumpTerm +
          (Math.max(step29, 0.5) + T_E430 + T_E431 + (9810 * step27) / 100000 + T_E432) +
          (T_E344 * 1000 * 9.81 * (step27 + 1 + frictionFactor(step22) * (T_E379 / step1) * (step8 / G) + kBoosterDis * (step8 / G))) / 100000 +
          (T_E344 * 1000 * 9.81 * (T_E363 + frictionFactor(step23) * (T_E364 / step2) * (step13 / G) + kBoosterSuc * (step13 / G))) / 100000 +
          (T_E344 * 1000 * 9.81 * (I_E61 + frictionFactor(step24r) * (I_E62 / step3) * (step14 / G) + kMW * (step14 / G))) / 100000) *
        (100000 / 9810) *
        (T_E357 / 100 + 1);

      const boosterRequired = I_E60 > (T_E344 * 1000 * 9.81 * step30) / 100000 ? "No" : "Yes";
      const boosterHeadRequired = (step30 - (I_E60 * 100000) / 9810) * 1.5; // K129 — shown as-is, not rounded
      const boosterHeadAvailable = boosterRequired === "Yes" ? I_E60 + (9810 * CEILING(boosterHeadRequired, 10)) / 100000 : I_E60;

      const dischargePressureNaClO2 =
        (sgNaClO2 *
          1000 *
          9.81 *
          (T_E294 -
            (T_E278 - T_E279) +
            (frictionFactor(step26) * (I_E55 / step5) * (step19 / G) + kDPNSuc * (step19 / G)) +
            (frictionFactor(step25) * (T_E295 / step4b) * (step16 / G) + kDPNDis * (step16 / G)) +
            boosterHeadAvailable * 10.2) *
          (T_E307 / 100 + 1)) /
        100000;

      const npshAvailDPN = npshAvail(10.33, T_E278 - T_E279, frictionFactor(step26) * (I_E55 / step5) * (step19 / G), kDPNSuc * (step19 / G), true);
      const npshSafetyDPN = npshAvailDPN - T_E291;

      const dphFlow = hclLPH / 3600000;
      const dphIdM = ID_SCH80_MM(PIPE_INCH(Math.sqrt((dphFlow * 4) / (0.3 * Math.PI)) * 1000)) / 1000;
      const dphVel = dphFlow / ((Math.PI * dphIdM * dphIdM) / 4);
      const dphRe = reynolds(sgHCl, dphVel, dphIdM, VISC_HCL);
      const dphFriction = frictionFactor(dphRe) * (10 / dphIdM) * ((dphVel * dphVel) / G);
      const npshAvailDPH = 10.43 - (dphFriction + (0.3 + dphFriction + (15.5 * (dphVel * dphVel)) / G));
      const npshSafetyDPH = npshAvailDPH - 2.5;

      OUT.push({
        title: "Dosing Pump",
        cards: [
          card("Pump Capacity (NaClO2)", ROUNDUP(naclo2LPH * 1.25, 0), "LPH"),
          card("Pump Capacity (HCl)", ROUNDUP(hclLPH * 1.25, 0), "LPH"),
          card("Margin (NaClO2)", ((naclo2LPH / ROUNDUP(naclo2LPH * 1.25, 0)) * 100).toFixed(4), "%", "", true),
          card("Margin (HCl)", ((hclLPH / ROUNDUP(hclLPH * 1.25, 0)) * 100).toFixed(4), "%", "", true),
          card("Line Size Suction (NaClO2)", lineInch(flowDPN, T_E277), "inch"),
          card("Line Size Suction (HCl)", lineInch(flowDPH, 0.3), "inch"),
          card("NPSH Required (NaClO2)", T_E291, "m", "", true),
          card("NPSH Required (HCl)", 2.5, "m", "", true),
          card("NPSH Available (NaClO2)", npshAvailDPN.toFixed(4), "m", "", true),
          card("NPSH Available (HCl)", npshAvailDPH.toFixed(4), "m", "", true),
          card("NPSH Safety (NaClO2)", npshSafetyDPN.toFixed(4), "m", "", true),
          card("NPSH Safety (HCl)", npshSafetyDPH.toFixed(4), "m", "", true),
          card("NPSH Safety Check (NaClO2)", npshAvailDPN > T_E291 + 1 ? "SAFE" : "CHECK NPSH", "", npshAvailDPN > T_E291 + 1 ? "safe" : "warn", true),
          card("NPSH Safety Check (HCl)", npshAvailDPH > 3.5 ? "SAFE" : "CHECK NPSH", "", npshAvailDPH > 3.5 ? "safe" : "warn", true),
          card("Line Size Discharge (NaClO2)", "1.5", "inch"),
          card("Line Size Discharge (HCl)", "1.5", "inch"),
          card("Discharge Pressure (NaClO2)", dischargePressureNaClO2.toFixed(4), "Bar"),
        ],
      });

      OUT.push({
        title: "Motive Water & Booster Pump",
        cards: [
          card("Target concentration", T_E343, "ppm"),
          card("Motive Water Required", motiveWaterM3hr.toFixed(4), "m3/hr"),
          card("Water pressure from client", I_E60, "Bar"),
          card("Line Size (Motive Water Main)", PIPE_INCH(Math.sqrt((motiveWaterM3s * 4) / (T_E345 * Math.PI)) * 1000), "inch"),
          card("Booster Pump Required", boosterRequired, "", boosterRequired === "Yes" ? "warn" : "safe"),
          card("Booster Pump Flowrate", motiveWaterM3hr.toFixed(4), "m3/hr"),
          card("Booster Pump Head Required", (boosterHeadRequired).toFixed(4), "m"),
          card("Line Size (Booster Discharge)", PIPE_INCH(Math.sqrt((motiveWaterM3s * 4) / (1.5 * Math.PI)) * 1000), "inch"),
          card("NPSH Available (Booster)", (10.33 + T_E363 - 0.2 - (frictionFactor(step23) * (T_E364 / step2) * (step13 / G) + (T_E363 + frictionFactor(step23) * (T_E364 / step2) * (step13 / G) + kBoosterSuc * (step13 / G)))).toFixed(4), "m", "", true),
          card("NPSH Required (Booster)", T_E376, "m", "", true),
        ],
      });

      /* =====================================================================
         REACTOR — one physical vessel; Q,Total/Volume/Diameter/Height reuse
         step6/step9/step10/step17/step20/step27 from the hydraulics block above.
      ===================================================================== */
      const reactorDia = step17r1; // ROUNDUP(step17, 1)
      const reactorHeight = step27; // ROUNDUP(step20 + freeboard, 1)
      const reactorVolumeLtrs = ((100 + T_E395) / 100) * step10 * 1000;
      const reactorActualVolumeLtrs = ((Math.PI * reactorDia * reactorDia * reactorHeight) / 4) * 1000;
      const reactorPressureBar = Math.max(ROUNDUP(boosterHeadAvailable * 1.5, 1), ROUNDUP((boosterHeadAvailable + 1) * (1 + T_E399 / 100), 0));
      const hydrotestPressureBar = reactorPressureBar * T_E402;
      const reactorPressureScaled = reactorPressureBar / 10;

      function reactorThk(radiusMm, stress, jointEff, corrosion, minThk) {
        const raw = (reactorPressureScaled * radiusMm) / (stress * jointEff - 0.6 * reactorPressureScaled) + corrosion;
        return Math.ceil(Math.max(raw, minThk) - 1e-9);
      }
      const shellFRP = reactorThk((reactorDia / 2) * 1000, T_E406, T_E407, T_E408, T_E409);
      const headFRP = shellFRP * 1.2;

      const packingVolumeM3 = ((100 + T_E395) / 100) * step10 * 0.6;
      const packingHeightM = (4 * packingVolumeM3) / (Math.PI * reactorDia * reactorDia);
      const designTemperature = I_E65 + 10 + 5 + T_E401;
      const reactorPressureDropBar = Math.max(step29, 0.5) + T_E430 + T_E431 + (9810 * step27) / 100000 + T_E432;
      const reactorOutletLineSize = lineInch(step9, T_E393);

      OUT.push({
        title: "Reactor",
        cards: [
          card("Q, Total", step6.toFixed(4), "m3/hr"),
          card("Reactor MOC", I_E76),
          card("Residence time", residenceTimeSec, "Sec"),
          card("Volume (nominal)", reactorVolumeLtrs.toFixed(4), "Ltrs", "", true),
          card("Diameter", reactorDia, "m"),
          card("Total Height", reactorHeight, "m"),
          card("Actual Volume", reactorActualVolumeLtrs.toFixed(4), "Ltrs", "", true),
          card("Design Pressure", reactorPressureBar.toFixed(4), "Bar", "", true),
          card("Design Temperature", designTemperature, "°C", "", true),
          card("Hydrotest Pressure", hydrotestPressureBar.toFixed(4), "Bar", "", true),
          card("Shell Thickness — Option 1 (Fully FRP)", shellFRP, "mm", "", true),
          card("Head Thickness — Option 1 (Fully FRP)", headFRP.toFixed(1), "mm", "", true),
          card("Option 2 (MS + FRP Lining) — MS Thickness", T_E417, "mm", "", true),
          card("Option 2 (MS + FRP Lining) — FRP Lining Thickness", T_E418, "mm", "", true),
          card("Option 3 (MS + PTFE Lining) — MS Thickness", getNum("T_E423"), "mm", "", true),
          card("Option 3 (MS + PTFE Lining) — PTFE Lining Thickness", getNum("T_E424"), "mm", "", true),
          card("Packing Volume", packingVolumeM3.toFixed(4), "m3", "", true),
          card("Packing Height", packingHeightM.toFixed(4), "m", "", true),
          card("Reactor Pressure Drop", reactorPressureDropBar.toFixed(4), "Bar", "", true),
          card("Reactor Dosing Point Pressure", sumpTerm.toFixed(4), "Bar"),
          card("Dosing Point Type", I_E68),
          card("Reactor Outlet Line Size", reactorOutletLineSize, "inch"),
        ],
      });

      /* =====================================================================
         BOQ — see buildClo2BoqAreas below. numReactors/diffuserCount have no
         dedicated input fields yet (the PDF spec's own example fixes these
         at 2 working+standby reactors and 1 diffuser point), so they're
         constants here rather than a formula.
      ===================================================================== */
      const numReactors = 2;
      const diffuserCount = 1;
      const boosterYes = boosterRequired === "Yes";
      // Bulk storage tank / unloading pump / transfer pump output sections
      // (and their BOQ line items, below) only make sense when bulk storage
      // was actually asked for — mirrors the matching input sections hidden
      // by updateBulkStorageVisibility. Computed here (before boqVars/BOQ
      // build) since buildClo2BoqAreas needs it too — the BOQ used to always
      // include the bulk storage tank/unloading/transfer pump line items
      // regardless of this toggle, which is what was still leaking into the
      // saved PDF even after the output-section/input-section fixes.
      const bulkStorageRequired = getText("BULK_STORAGE_REQUIRED") !== "No";
      const boqVars = {
        pumpCapUPN, pumpCapUPH, I_E25, I_E26, I_E30, I_E31,
        pumpCapTPN, pumpCapTPH, I_E45, I_E46, I_E50, I_E51,
        I_E15, I_E19,
        bulkTankVolNaClO2: CEILING(bulkChainNaClO2, 500) / 1000,
        bulkTankVolHCl: CEILING(bulkChainHCl, 500) / 1000,
        bulkHeightNaClO2, bulkHeightHCl,
        measuringVolNaClO2, measuringVolHCl, measHeightNaClO2, measHeightHCl,
        dosingCapNaClO2: ROUNDUP(naclo2LPH * 1.25, 0),
        dosingCapHCl: ROUNDUP(hclLPH * 1.25, 0),
        dosingFlowMeterNaClO2: ROUNDUP(ROUNDUP(naclo2LPH * 1.25, 0) * 1.2, 0),
        dosingFlowMeterHCl: ROUNDUP(ROUNDUP(hclLPH * 1.25, 0) * 1.2, 0),
        I_E55, I_E57: getNum("I_E57"),
        motiveWaterM3hrRounded: motiveWaterM3hr.toFixed(2),
        boosterYes,
        waterSucQty: boosterYes ? 5 : I_E62,
        waterDisQty: boosterYes ? I_E62 : 0,
        reactorVolLitres: reactorActualVolumeLtrs.toFixed(2),
        reactorMoc: I_E76,
        numReactors,
        reactorPipeLen: 5,
        reactorOutletPipeLen: Number((I_E66 + 5).toFixed(2)),
        diffuserCount,
        bulkStorageRequired,
      };
      const BOQ = buildClo2BoqAreas(boqVars);

      const BULK_ONLY_OUTPUT_TITLES = ["Unloading Pump", "Bulk Storage Tank Requirement (KL)", "Transfer Pump"];
      const visibleOUT = bulkStorageRequired ? OUT : OUT.filter((g) => !BULK_ONLY_OUTPUT_TITLES.includes(g.title));

      return {
        groups: visibleOUT,
        boq: BOQ,
        capacity: systemCapacity,
        headline: `${systemCapacity < 1 ? systemCapacityGHr.toFixed(0) + " g/hr" : systemCapacity + " kg/hr"} ClO2 · NaClO2 ${naclo2LPH.toFixed(2)} LPH · HCl ${hclLPH.toFixed(2)} LPH`,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  function boqItem(name, spec, moc, qty, unit) {
    return { item: name, specification: spec === undefined || spec === null ? "-" : spec, moc: moc || "-", qty, unit: unit || "nos", price: "" };
  }

  function clo2PumpLineItems(prefix, pumpLabel, pumpCapVal, sizeSuc, sizeDis, pipeSuc, pipeDis) {
    const erection = pipeSuc + pipeDis;
    return [
      boqItem("Diaphragm valve", sizeSuc, "CPVC", 3, "nos"),
      boqItem("Diaphragm valve", sizeDis, "CPVC", 2, "nos"),
      boqItem("Check valve", sizeDis, "CPVC", 2, "nos"),
      boqItem(`${prefix} ${pumpLabel} Pump`, `${pumpCapVal} m3/hr`, "PP", 2, "nos"),
      boqItem("Pressure gauge", "0 to 10 Kg/cm2", "SS316", 2, "nos"),
      boqItem("Ball valve", '1/2"', "CPVC", 6, "nos"),
      boqItem(`${pumpLabel} Pump Base Skid`, "-", "MS Painted", 1, "nos"),
      boqItem("Pipe Lines (Suction)", sizeSuc, "CPVC", pipeSuc, "Metres"),
      boqItem("Pipe Lines (Discharge)", sizeDis, "CPVC", pipeDis, "Metres"),
      boqItem("Power Cables", "-", "-", 25, "Metres"),
      boqItem("Control Cables", "-", "-", 25, "Metres"),
      boqItem("Cable Tray", "-", "FRP", 25, "Metres"),
      boqItem("Local Push Button", "-", "SS316", 2, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", sizeSuc, "CPVC", 8, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", sizeDis, "CPVC", 10, "nos"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 35, "nos"),
      boqItem("Junction Box", "-", "SS316", 1, "nos"),
      boqItem(`Diaphragm valve to ${prefix} ${pumpLabel.toLowerCase()} water service`, sizeSuc, "CPVC", 1, "nos"),
      boqItem("Erection For Pipes", "-", "-", erection, "Metres"),
      boqItem("Supervision for Erection", "-", "-", 1, "Days"),
      boqItem("Supervision for commisioning", "-", "-", 1, "Days"),
    ];
  }

  function clo2BulkTankItems(prefix, tankCount, tankVol, tankHeight, hasFumesAbsorber) {
    const pipesQty = Number((tankHeight * tankCount + 5).toFixed(2));
    const items = [
      boqItem("Level Transmitter", "Range 0.1 to 6 m", "PP", tankCount, "nos"),
      boqItem("Level Gauge", "Range 0.1 to 6 m", "PP", tankCount, "nos"),
      boqItem("Bulk Storage Tank", `${tankVol} m3`, "-", tankCount, "Tanks"),
      boqItem("Diaphragm valve", 5, "CPVC", tankCount, "nos"),
      boqItem("Diaphragm valve", 80, "CPVC", tankCount, "nos"),
    ];
    if (hasFumesAbsorber) items.push(boqItem("Fumes absorber", "102 Litres", "-", tankCount, "nos"));
    items.push(
      boqItem("Power Cables", "-", "-", 15, "Metres"),
      boqItem("Instrument Cables", "-", "-", 15, "Metres"),
      boqItem("Cable Tray", "-", "FRP", 15, "Metres"),
      boqItem("Pipes", 3, "CPVC", pipesQty, "Metres"),
      boqItem("Fittings (elbow,tee,reducer)", 3, "CPVC", 3, "nos"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 35, "nos"),
      boqItem(`Diaphragm valve to ${prefix} tank water service`, 150, "CPVC", tankCount, "nos"),
      boqItem("Erection For Tank", "-", "-", tankCount, "Tanks"),
      boqItem("Supervision for Erection", "-", "-", 1, "Days"),
    );
    return items;
  }

  function clo2MeasTankItems(prefix, tankVol, tankHeight, hasFumesAbsorber) {
    const pipesQty = Number((tankHeight + 5).toFixed(2));
    const items = [
      boqItem("Level Transmitter", "Range 0.1 to 6 m", "PP", 1, "nos"),
      boqItem("Level Gauge", "Range 0.1 to 6 m", "PP", 1, "nos"),
      boqItem("Measuring Tank", `${tankVol.toFixed ? tankVol.toFixed(2) : tankVol} m3`, "PP + FRP", 1, "nos"),
      boqItem("Diaphragm valve", 2, "CPVC", 2, "nos"),
      boqItem("Diaphragm valve", 100, "CPVC", 1, "nos"),
    ];
    if (hasFumesAbsorber) {
      items.push(boqItem("Fumes absorber", "102 Litres", "-", 1, "nos"));
      items.push(boqItem("Diaphragm valve", 25, "CPVC", 2, "nos"));
    }
    items.push(
      boqItem("Power Cables", "-", "-", 15, "Metres"),
      boqItem("Instrument Cables", "-", "-", 15, "Metres"),
      boqItem("Cable Tray", "-", "FRP", 15, "Metres"),
      boqItem("Pipes", 4, "CPVC", pipesQty, "Metres"),
      boqItem("Fittings (elbow,tee,reducer)", 4, "CPVC", 3, "nos"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 35, "nos"),
      boqItem(`Diaphragm valve to ${prefix} tank water service`, 150, "CPVC", 1, "nos"),
      boqItem("Erection For Tank", "-", "-", 1, "Tank"),
      boqItem("Supervision for Erection", "-", "-", 1, "Days"),
    );
    return items;
  }

  function clo2DosingLineItems(prefix, pumpCapLPH, flowMeterRangeLPH, pipeSuc, pipeDis) {
    const erection = pipeSuc + pipeDis;
    return [
      boqItem("Diaphragm valve", 2, "CPVC", 4, "nos"),
      boqItem("Diaphragm valve", 1.5, "CPVC", 3, "nos"),
      boqItem("Check valve", 1.5, "CPVC", 2, "nos"),
      boqItem("Check valve", '1/2"', "CPVC", 2, "nos"),
      boqItem("Ball valve", '1/2"', "CPVC", 10, "nos"),
      boqItem("Y type strainer", 2, "CPVC", 1, "nos"),
      boqItem("Calibration column", '1/2" End Connection', "-", 1, "nos"),
      boqItem(`${prefix} Dosing pump`, `${pumpCapLPH} LPH`, "PP", 2, "nos"),
      boqItem("Pressure relief valve", 1.5, "CPVC", 2, "nos"),
      boqItem("Pulsation dampener", '1/2" End Connection', "-", 1, "nos"),
      boqItem("Pressure gauge", "0 to 16 Kg/cm2", "SS316", 1, "nos"),
      boqItem("pressure transmitter", "0 to 16 Kg/cm2", "SS316 Wetted Parts", 1, "nos"),
      boqItem("Flow meter", `Range 0 to ${flowMeterRangeLPH} LPH`, "PVDF", 1, "nos"),
      boqItem("Pipe Lines (Suction)", 2, "CPVC", pipeSuc, "Metres"),
      boqItem("Pipe Lines (Discharge)", 1.5, "CPVC", pipeDis, "Metres"),
      boqItem("Power Cables", "-", "-", 15, "Metres"),
      boqItem("Control Cables", "-", "-", 15, "Metres"),
      boqItem("Instrument Cables", "-", "-", 15, "Metres"),
      boqItem("Cable Tray", "-", "FRP", 15, "Metres"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 35, "nos"),
      boqItem("Junction Box", "-", "SS316", 1, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", 2, "CPVC", 8, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", 1.5, "CPVC", 10, "nos"),
      boqItem(`${prefix} Dosing Skid`, "-", "MS Painted", 1, "nos"),
      boqItem("Erection For Pipes", "-", "-", erection, "Metres"),
      boqItem("Supervision for Erection", "-", "-", 1, "Days"),
      boqItem("Supervision for commisioning", "-", "-", 1, "Days"),
    ];
  }

  function clo2WaterLineItems(motiveWaterFlow, boosterYes, pipeSuc, pipeDis) {
    const erection = pipeSuc + pipeDis;
    return [
      boqItem("Diaphragm valve", 12, "CPVC", 6, "nos"),
      boqItem("Basket strainer", 12, "-", 1, "nos"),
      boqItem("Electro mag flow meter", `Range 0 to ${motiveWaterFlow} m3/hr`, "PTFE Liner + SS316 Electrode", 1, "nos"),
      boqItem("Pressure gauge", "0 to 16 Kg/cm2", "SS316", boosterYes ? 3 : 1, "nos"),
      boqItem("pressure transmitter", "0 to 16 Kg/cm2", "SS316 Wetted Parts", 1, "nos"),
      boqItem("Ball valve", '1/2"', "CPVC", boosterYes ? 6 : 2, "nos"),
      boqItem("Check valve", 12, "CPVC", boosterYes ? 2 : 1, "nos"),
      boqItem("Booster pump", `${motiveWaterFlow} m3/hr`, "SS316", boosterYes ? 2 : 0, "nos"),
      boqItem("Pressure transmitter for booster pump", "0 to 16 Kg/cm2", "SS316 Wetted Parts", boosterYes ? 2 : 0, "nos"),
      boqItem("Flow meter", `Range 0 to ${motiveWaterFlow} m3/hr`, "PVDF", boosterYes ? 2 : 1, "nos"),
      boqItem("Pipe Lines (Suction)", 12, "CPVC", pipeSuc, "Metres"),
      boqItem("Pipe Lines (Discharge)", 12, "CPVC", pipeDis, "Metres"),
      boqItem("Power Cables", "-", "-", 15, "Metres"),
      boqItem("Control Cables", "-", "-", 15, "Metres"),
      boqItem("Instrument Cables", "-", "-", 15, "Metres"),
      boqItem("Cable Tray", "-", "FRP", 15, "Metres"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 35, "nos"),
      boqItem("Junction Box", "-", "SS316", 1, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", 12, "CPVC", 8, "nos"),
      boqItem("Water Line Skid", "-", "MS Painted", 1, "nos"),
      boqItem("Erection For Pipes", "-", "-", erection, "Metres"),
      boqItem("Supervision for Erection", "-", "-", 1, "Days"),
      boqItem("Supervision for commisioning", "-", "-", 1, "Days"),
    ];
  }

  function clo2ReactorItems(reactorVolLitres, reactorMoc, numReactors, motiveWaterFlow, reactorPipeLen) {
    return [
      boqItem("Diaphragm valve", 12, "CPVC", 2 * numReactors, "nos"),
      boqItem("Reactor", `${reactorVolLitres} Litres`, reactorMoc, numReactors, "nos"),
      boqItem("Check valve", 12, "CPVC", numReactors, "nos"),
      boqItem("Ball valve", '1/2"', "CPVC", 3 + numReactors, "nos"),
      boqItem("Electro mag flow meter", `Range 0 to ${motiveWaterFlow}`, "PTFE Liner + SS316 Electrode", 1, "nos"),
      boqItem("Ph sensor", "0 to 14 pH", "PVDF", 1, "nos"),
      boqItem("ORP Sensor", "-2000 to 2000 mv", "PVDF", 1, "nos"),
      boqItem("ClO2 Analyzer", "0 to 20 mg/L", "SS316", 0, "nos"),
      boqItem("Control Panel", "-", "-", 1, "nos"),
      boqItem("Reactor Skid", "-", "MS Painted", 1, "nos"),
      boqItem("Pipe Lines", 12, "CPVC", reactorPipeLen, "Metres"),
      boqItem("Power Cables", "-", "-", 15, "Metres"),
      boqItem("Control Cables", "-", "-", 15, "Metres"),
      boqItem("Instrument Cables", "-", "-", 15, "Metres"),
      boqItem("Cable Tray", "-", "FRP", 15, "Metres"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 35, "nos"),
      boqItem("Junction Box", "-", "SS316", 1, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", 12, "CPVC", 8, "nos"),
      boqItem("Erection For Pipes", "-", "-", reactorPipeLen, "Metres"),
      boqItem("Supervision for Erection", "-", "-", 1, "Days"),
      boqItem("Supervision for commisioning", "-", "-", 1, "Days"),
    ];
  }

  function clo2ReactorOutletItems(pipeLen, diffuserCount) {
    return [
      boqItem("Diaphragm valve", 12, "CPVC", 1, "nos"),
      boqItem("Diffuser", 12, "CPVC", diffuserCount, "nos"),
      boqItem("Pipe Lines", 12, "CPVC", pipeLen, "meters"),
      boqItem("Fasteners (Bolt,Nut,Washer)", "-", "SS304", 40, "nos"),
      boqItem("Fittings (elbow,tee,reducer)", 12, "CPVC", 8, "nos"),
      boqItem("Erection For Pipes", "-", "-", pipeLen, "meters"),
      boqItem("Supervision for Erection", "-", "-", 1, "days"),
      boqItem("Supervision for commisioning", "-", "-", 1, "days"),
    ];
  }

  // v carries every locally-computed value from calculate() the 6 areas
  // need — see the call site right before renderOutputs(OUT).
  function buildClo2BoqAreas(v) {
    // Unloading Pump, Transfer Pump, and the Bulk Storage Tank itself are all
    // BOQ line items only when bulk storage is actually being procured — this
    // used to render (and get saved into the PDF) unconditionally, which is
    // what was still showing up even after the output-section/input-section
    // toggle fixes (those only touched the on-screen results and technical
    // input sheet, not the BOQ generator).
    const bulkStorageRequired = v.bulkStorageRequired !== false;
    const transferPump = bulkStorageRequired
      ? [
          ...clo2PumpLineItems("NaClO2", "Unloading", v.pumpCapUPN, 4, 3, v.I_E25, v.I_E26),
          ...clo2PumpLineItems("HCl", "Unloading", v.pumpCapUPH, 4, 3, v.I_E30, v.I_E31),
          ...clo2PumpLineItems("NaClO2", "Transfer", v.pumpCapTPN, 5, 4, v.I_E45, v.I_E46),
          ...clo2PumpLineItems("HCl", "Transfer", v.pumpCapTPH, 5, 4, v.I_E50, v.I_E51),
        ]
      : [];
    const measuringTank = [
      ...(bulkStorageRequired
        ? [
            ...clo2BulkTankItems("NaClO2", v.I_E15, v.bulkTankVolNaClO2, v.bulkHeightNaClO2, false),
            ...clo2BulkTankItems("HCl", v.I_E19, v.bulkTankVolHCl, v.bulkHeightHCl, true),
          ]
        : []),
      ...clo2MeasTankItems("NaClO2", v.measuringVolNaClO2, v.measHeightNaClO2, false),
      ...clo2MeasTankItems("HCl", v.measuringVolHCl, v.measHeightHCl, true),
    ];
    const dosingSkid = [
      ...clo2DosingLineItems("NaClO2", v.dosingCapNaClO2, v.dosingFlowMeterNaClO2, v.I_E55, 10),
      ...clo2DosingLineItems("HCl", v.dosingCapHCl, v.dosingFlowMeterHCl, v.I_E57, 10),
    ];
    const waterLine = clo2WaterLineItems(v.motiveWaterM3hrRounded, v.boosterYes, v.waterSucQty, v.waterDisQty);
    const reactorSkid = clo2ReactorItems(v.reactorVolLitres, v.reactorMoc, v.numReactors, v.motiveWaterM3hrRounded, v.reactorPipeLen);
    const reactorOutlet = clo2ReactorOutletItems(v.reactorOutletPipeLen, v.diffuserCount);

    return [
      { area: "Transfer Pump to Measuring Tank Area", scopeKey: "transferPump", items: transferPump },
      { area: "Measuring Tank Area", scopeKey: "measuringTank", items: measuringTank },
      { area: "Dosing Skid", scopeKey: "dosingSkid", items: dosingSkid },
      { area: "Water line to Reactor Inlet", scopeKey: "waterLine", items: waterLine },
      { area: "Reactor Skid", scopeKey: "reactorSkid", items: reactorSkid },
      { area: "Reactor Outlet to Dosing Point", scopeKey: "reactorOutlet", items: reactorOutlet },
    ];
  }

  INPUT_GROUPS[0].sections[0].fields.find(f => f.id === 'BULK_STORAGE_REQUIRED').rerender = true;
  const SCOPES = [
    ['transferPump', 'Transfer Pump to Measuring Tank Area'], ['measuringTank', 'Measuring Tank Area'], ['dosingSkid', 'Dosing Skid'],
    ['waterLine', 'Water line to Reactor Inlet'], ['reactorSkid', 'Reactor Skid'], ['reactorOutlet', 'Reactor Outlet to Dosing Point'],
  ];

  function sections(v) {
    const bulk = v.BULK_STORAGE_REQUIRED !== 'No';
    const out = [];
    [...INPUT_GROUPS, ...TECH_GROUPS].forEach(g => g.sections.forEach(s => out.push({ ...s, group: g.group, hidden: Boolean(s.bulkOptional && !bulk) })));
    out.push({ group: 'BOQ & Report', title: 'BOQ Configuration', note: 'RSVP Scope: supplied by RSVP and included in the BOQ. Client Scope: supplied by the client, so quantities are zeroed.', fields: SCOPES.map(([k, label]) => F(`boqScope_${k}`, label, '', 'RSVP', 'select', BOQ_SCOPE_OPTS)) });
    out.push({ group: 'BOQ & Report', title: 'Design Report Remark', fields: [F('designReportRemark', 'Remark', '', CALC_REMARK, 'textarea')] });
    return out;
  }

  return { sections, compute(v) { CUR = v; return calculate(); } };
})();

/* ============================== Electrochlorinator (continuous) ============================== */
const ELECTRO_ENGINE = (() => {
  let CUR = {};
  function getNum(id) { const v = parseFloat(CUR[id]); return isNaN(v) ? 0 : v; }
  function getText(id) { return CUR[id] == null ? '' : String(CUR[id]); }

  function F(id, label, unit, value, type, opts) {
    return { id, label, unit: unit || "", value, type: type || "num", opts };
  }

  /* ---------------------------------------------------------------------
     Family A — primary design inputs (doc Section 2.1, Section 1 "blue"
     cells of the master sheet).
  --------------------------------------------------------------------- */
  const INPUT_GROUPS = [
    {
      group: "System Inputs",
      sections: [
        {
          title: "Design Basis (Section 1)",
          fields: [
            F("B6", "Flow Rate to Treat (Q0)", "", 50),
            F("C6", "Flow Rate Unit", "", "m3/hr", "select", ["m3/hr", "MLD", "ltr/hr"]),
            F("E7", "Product Generation Hours/Day (Hop)", "hr/day", 24),
            F("B8", "Capacity Required (Override, Cap*) — leave 0 to size from flow", "kg/hr", 0),
            F("E8", "Design Margin Factor (Mf)", "", 1.2),
            F("B9", "Cl2 Dose Required (Dcl)", "mg/L", 250),
            F("E9", "Product Dosing Hours/Day (Hdose)", "hr/day", 24),
            F("B10", "NaOCl Product Concentration, Cell Out (Cp)", "g/L", 6),
            F("B11", "Salt Purity, NaCl (Ps)", "%", 99),
            F("B12", "Cooling Time (tcool)", "hr", 5),
            F("E10", "Feed-Water Hardness, Max (Hard)", "mg/L as CaCO3", 50),
            F("E11", "Min Feed-Water Temp (Tmin)", "°C", 15),
            F("E12", "Max Feed-Water Temp (Tmax)", "°C", 45),
          ],
        },
      ],
    },
    {
      /* Family B — paper basis constants (doc Section 2.2, Section 3 of the
         master sheet). Effectively fixed, but they live in editable cells
         in the source workbook, so they are inputs in the strict sense. */
      group: "Paper Basis Constants",
      sections: [
        {
          title: "Casson & Bess (2006) Batch-Experiment Basis (Section 3)",
          internal: true,
          fields: [
            F("B24", "NaCl per Batch (Nb)", "kg", 1.588),
            F("B25", "Water per Batch (Wb)", "L", 56.8),
            F("B26", "Power per Batch (Pb)", "kWh", 2.5),
          ],
        },
      ],
    },
  ];

  /* ---------------------------------------------------------------------
     Family C — embedded engineering assumptions (doc Section 2.3). These
     are baked directly into the formulas rather than sitting in labelled
     input cells, matching the source workbook exactly.
  --------------------------------------------------------------------- */
  const DILUTION_DIVISOR = 11; // 10:1 water:brine dilution ratio
  const DILUTE_BRINE_DENSITY = 1.017; // kg/L, 30 g/L brine @ 30°C
  const SAT_BRINE_DENSITY = 1.185; // kg/L, 300 g/L brine @ 30°C
  const CELL_FREEBOARD = 1.2; // 20% freeboard, round to 50 L
  const SALT_SAT_STORAGE_DAYS = 7; // buffer stock duration
  const DILUTION_FREEBOARD = 1.1; // 10% freeboard, round to 500 L
  const DILUTION_HOLDUP_HR = 8; // dilution-tank hold-up
  const PRODUCT_FREEBOARD = 1.25; // 25% freeboard, round to 100 L
  const PRODUCT_HOLDUP_HR = 12; // product-tank hold-up
  const RECTIFIER_EFFICIENCY = 0.82; // SCR thyristor (75-90%)
  const AUX_LOAD_ALLOWANCE = 0.15; // pumps, fans, controls, softener
  const BRINE_SPECIFIC_HEAT = 3.9; // kJ/kg.K, chiller heat-duty basis
  const ACID_CLEANING_FACTOR = 1.2; // acid volume vs cell housing
  const H2_STOICH_NUM = 2.016;
  const H2_STOICH_DEN = 70.9; // kg H2 per kg Cl2
  const MOLAR_VOLUME_STP = 22.4; // L/mol, H2 gas volume
  const H2_VENTILATION_DIVISOR = 20; // H2 ventilation target 2% v/v (half of 4% LEL)

  function CEILING(x, s) {
    return Math.ceil(x / s) * s;
  }

  function calculate() {
    try {
      const OUT = [];
      const card = (label, value, unit, flag, internal) => ({ label, value, unit: unit || "", flag, internal: Boolean(internal) });

      /* ---- Inputs ---- */
      const B6 = getNum("B6"), C6 = getText("C6");
      const E7 = getNum("E7"), B8 = getNum("B8"), E8 = getNum("E8");
      const B9 = getNum("B9"), E9 = getNum("E9"), B10 = getNum("B10"), B11 = getNum("B11"), B12 = getNum("B12");
      const E10 = getNum("E10"), E11 = getNum("E11"), E12 = getNum("E12");
      const B24 = getNum("B24"), B25 = getNum("B25"), B26 = getNum("B26");

      if (B10 <= 0) throw new Error("NaOCl product concentration (Cp) must be greater than 0");
      if (B11 <= 0) throw new Error("Salt purity (Ps) must be greater than 0");
      if (E7 <= 0 || E9 <= 0) throw new Error("Operating/dosing hours must be greater than 0");
      if (E12 <= E11) throw new Error("Max feed-water temp must be greater than min feed-water temp");

      // B7 — flow rate normalised to m3/hr
      const Q = C6 === "MLD" ? (B6 * 1000000) / 24 / 1000 : C6 === "ltr/hr" ? B6 / 1000 : B6;

      const Cp = B10, Ps = B11, Hop = E7, Hdose = E9, Nb = B24, Wb = B25, Pb = B26, Mf = E8 || 1;
      const Dcl = B9, tcool = B12 || 1, Tmin = E11, Tmax = E12;

      /* =====================================================================
         3.1 THE PIVOTAL QUANTITY — DESIGN Cl2
         Cl_d = CEILING(Q*Dcl/1000, 1 kg) ... or Cap* (B8) if the user enters
         a manual override. Note (doc Section 8.3 / this file's header
         comment): the margin factor E8/Mf is NOT applied here, only the
         ceiling. It only affects the salt-saturation tank (B52).
      ===================================================================== */
      const netCl2 = (Q * Dcl) / 1000; // kg/hr, B16
      const Cl_d = B8 > 0 ? B8 : Math.ceil(netCl2); // kg/hr, B17
      const dailyCl2 = Cl_d * Hop; // kg/day, B18
      const cl2PerMin = (Q * Dcl) / 60; // g/min, B19

      OUT.push({
        title: "3.2 Chlorine Demand",
        cards: [
          card("Flow Rate to Treat (Q, normalised)", Q.toFixed(2), "m3/hr"),
          card("Cl2 Demand (net)", netCl2.toFixed(2), "kg/hr"),
          card("Design Cl2 (with margin)", Cl_d, "kg/hr", undefined),
          card("Capacity Basis", B8 > 0 ? "Client-Stated (Override)" : "Calculated — CEILING(Net, 1 kg)", ""),
          card("Daily Cl2 Demand", dailyCl2.toFixed(2), "kg/day"),
          card("Cl2 Demand per Minute", cl2PerMin.toFixed(2), "g/min"),
        ],
      });

      /* =====================================================================
         3.3 SPECIFIC CONSUMPTION (paper basis, per kg Cl2)
      ===================================================================== */
      const cl2PerBatch = (Cp * Wb) / 1000; // B27
      const naclPerKgCl2 = (1000 * Nb) / (Cp * Wb); // B29
      const waterPerKgCl2 = 1000 / Cp; // B30
      const powerPerKgCl2 = (1000 * Pb) / (Cp * Wb); // B31
      OUT.push({
        title: "3.3 Specific Consumption (Paper Basis, per kg Cl2)",
        cards: [
          card("Cl2 per Batch (Paper)", cl2PerBatch.toFixed(3), "kg Cl2"),
          card("NaCl per kg Cl2", naclPerKgCl2.toFixed(3), "kg/kg"),
          card("Water per kg Cl2", waterPerKgCl2.toFixed(1), "L/kg"),
          card("Power per kg Cl2", powerPerKgCl2.toFixed(3), "kWh/kg"),
        ],
      });

      /* =====================================================================
         3.4 HOURLY PROCESS FLOWS
      ===================================================================== */
      const naoclProducedLHr = (1000 * Cl_d) / Cp; // B33
      const naclConsumptionPure = (1000 * Cl_d * Nb) / (Cp * Wb); // B34
      const naclConsumptionAsSupplied = (100000 * Cl_d * Nb) / (Cp * Wb * Ps); // B34 / Ps
      const dailyNaCl = (1000 * Cl_d * Nb * Hop) / (Cp * Wb); // B35
      const brineDilutionWater = (10000 * Cl_d) / (DILUTION_DIVISOR * Cp); // B36
      const saltSaturationWater = (1000 * Cl_d) / (DILUTION_DIVISOR * Cp); // B37
      const totalSoftenedFeedWater = (1000 * Cl_d) / Cp; // B38
      const powerConsumption = (1000 * Cl_d * Pb) / (Cp * Wb); // B39
      const dailyPower = (1000 * Cl_d * Pb * Hop) / (Cp * Wb); // B40
      OUT.push({
        title: "3.4 Hourly Process Flows",
        cards: [
          card("NaOCl Solution Produced", naoclProducedLHr.toFixed(1), "L/hr"),
          card("NaCl Consumption (Pure)", naclConsumptionPure.toFixed(2), "kg/hr"),
          card("NaCl Consumption (As-Supplied)", naclConsumptionAsSupplied.toFixed(2), "kg/hr"),
          card("Daily NaCl Consumption", dailyNaCl.toFixed(1), "kg/day"),
          card("Brine Dilution Water", brineDilutionWater.toFixed(1), "L/hr"),
          card("Salt Saturation Water", saltSaturationWater.toFixed(1), "L/hr"),
          card("Total Softened Feed Water", totalSoftenedFeedWater.toFixed(1), "L/hr"),
          card("Power Consumption", powerConsumption.toFixed(2), "kW"),
          card("Daily Power Consumption", dailyPower.toFixed(1), "kWh/day"),
        ],
      });

      /* =====================================================================
         3.5 EQUIPMENT SIZING — Electrolyzer cells
      ===================================================================== */
      const unitCellCapacity = Cl_d * Hop; // B45
      const cellHousingCapacity1Hr = ((Cl_d / Cp) * (1000 + (100000 * Nb) / (Wb * Ps))) / DILUTE_BRINE_DENSITY; // B46
      const cellHousingWorkingVol = CEILING(cellHousingCapacity1Hr * CELL_FREEBOARD, 50); // B47
      OUT.push({
        title: "3.5 Electrolyzer Cells",
        cards: [
          card("Unit Cell Capacity", unitCellCapacity.toFixed(1), "kg/day"),
          card("Cell Housing Capacity (1 hr)", cellHousingCapacity1Hr.toFixed(1), "L"),
          card("Cell Housing Working Volume", cellHousingWorkingVol, "L"),
        ],
      });

      /* =====================================================================
         Salt storage & dissolver
      ===================================================================== */
      const dailySaltConsumption = (100000 * Cl_d * Nb * Hop) / (Cp * Wb * Ps); // B50
      const saltSaturationVol7d = ((dailySaltConsumption + saltSaturationWater * Hop) * SALT_SAT_STORAGE_DAYS) / SAT_BRINE_DENSITY; // B51
      const saltSaturationWorkingVol = CEILING(saltSaturationVol7d * Mf, 500); // B52
      OUT.push({
        title: "Salt Storage & Dissolver",
        cards: [
          card("Daily Salt Consumption", dailySaltConsumption.toFixed(1), "kg/day"),
          card(`Salt Saturation Volume (${SALT_SAT_STORAGE_DAYS} d)`, saltSaturationVol7d.toFixed(0), "L"),
          card("Salt Saturation Working Volume", saltSaturationWorkingVol, "L"),
        ],
      });

      /* =====================================================================
         Brine dilution
      ===================================================================== */
      const dilutionTank8Hr = cellHousingCapacity1Hr * DILUTION_HOLDUP_HR; // B53
      const dilutionTankWorkingVol = CEILING(dilutionTank8Hr * DILUTION_FREEBOARD, 500); // B54
      OUT.push({
        title: "Brine Dilution",
        cards: [
          card(`Dilution Tank (${DILUTION_HOLDUP_HR} hr)`, dilutionTank8Hr.toFixed(0), "L"),
          card("Dilution Tank Working Volume", dilutionTankWorkingVol, "L"),
        ],
      });

      /* =====================================================================
         Product (NaOCl) storage
      ===================================================================== */
      const naoclProducedPerHr = (1000 * Cl_d) / Cp; // B57
      const storageVolume12Hr = (12000 * Cl_d) / Cp; // B58 (12 hr = PRODUCT_HOLDUP_HR)
      const selectedTankSize = CEILING(storageVolume12Hr * PRODUCT_FREEBOARD, 100); // B59
      OUT.push({
        title: "Product (NaOCl) Storage",
        cards: [
          card("NaOCl Produced per Hour", naoclProducedPerHr.toFixed(1), "L/hr"),
          card(`Storage Volume (${PRODUCT_HOLDUP_HR} hr)`, storageVolume12Hr.toFixed(0), "L"),
          card("Selected Tank Size", selectedTankSize, "L"),
        ],
      });

      /* =====================================================================
         DC power rectifier
      ===================================================================== */
      const totalElectrolysisPower = (1000 * Cl_d * Pb) / (Cp * Wb); // B62
      const acPowerInput = totalElectrolysisPower / RECTIFIER_EFFICIENCY; // B64
      const auxLoads = acPowerInput * AUX_LOAD_ALLOWANCE; // B65
      const totalConnectedLoad = (totalElectrolysisPower * (1 + AUX_LOAD_ALLOWANCE)) / RECTIFIER_EFFICIENCY; // B66
      OUT.push({
        title: "DC Power Rectifier",
        cards: [
          card("Total Electrolysis Power", totalElectrolysisPower.toFixed(2), "kW"),
          card("AC Power Input Required", acPowerInput.toFixed(2), "kW"),
          card(`Auxiliary Loads (${(AUX_LOAD_ALLOWANCE * 100).toFixed(0)}%)`, auxLoads.toFixed(2), "kW"),
          card("Total Connected Load", totalConnectedLoad.toFixed(2), "kW"),
        ],
      });

      /* =====================================================================
         Chiller unit
      ===================================================================== */
      const requiredChillerCapacity = (dilutionTank8Hr * DILUTE_BRINE_DENSITY * BRINE_SPECIFIC_HEAT * (Tmax - Tmin)) / 3600 / tcool; // B70
      const brineCirculationPump = (requiredChillerCapacity / (DILUTE_BRINE_DENSITY * BRINE_SPECIFIC_HEAT * DILUTION_HOLDUP_HR)) * 60; // B71
      OUT.push({
        title: "Chiller Unit",
        cards: [
          card("Required Chiller Capacity", requiredChillerCapacity.toFixed(1), "kW"),
          card("Brine Circulation Pump", brineCirculationPump.toFixed(1), "LPM"),
        ],
      });

      /* =====================================================================
         Acid cleaning unit
      ===================================================================== */
      const acidRequired = cellHousingWorkingVol * ACID_CLEANING_FACTOR; // B74
      const acidStorageTank = CEILING(acidRequired, 100); // B75
      const acidDosingPump = acidRequired / 1; // B76, per 1 hr cleaning cycle -> LPH
      OUT.push({
        title: "Acid Cleaning Unit",
        cards: [
          card("Acid Required for Cleaning", acidRequired.toFixed(0), "L"),
          card("Acid Storage Tank", acidStorageTank, "L"),
          card("Acid Dosing Pump", acidDosingPump.toFixed(0), "LPH"),
        ],
      });

      /* =====================================================================
         Water softener
      ===================================================================== */
      const totalFeedWaterFlow = (1000 * Cl_d) / Cp; // B79
      const softenerServiceFlow = Cl_d / Cp; // B80
      OUT.push({
        title: "Water Softener",
        cards: [
          card("Total Feed-Water Flow", totalFeedWaterFlow.toFixed(1), "L/hr"),
          card("Softener Service Flow", softenerServiceFlow.toFixed(3), "m3/hr"),
          card("Max Feed-Water Hardness (Target)", E10, "mg/L as CaCO3"),
        ],
      });

      /* =====================================================================
         Dosing pumps
      ===================================================================== */
      const dosingFlowLPH = ((1000 * Cl_d) / Cp) * (Hop / Hdose); // B85
      OUT.push({
        title: "Dosing Pumps",
        cards: [
          card("NaOCl Dosing Flow Required", dosingFlowLPH.toFixed(1), "LPH"),
          card("No. of Dosing Pumps", "2 (1 Working + 1 Standby)", ""),
        ],
      });

      /* =====================================================================
         Hydrogen dilution system
      ===================================================================== */
      const h2GenerationRate = (Cl_d * H2_STOICH_NUM) / H2_STOICH_DEN; // B94
      const h2VolumeSTP = (Cl_d * MOLAR_VOLUME_STP * 1000) / H2_STOICH_DEN; // B95
      const minVentilationAir = h2VolumeSTP / H2_VENTILATION_DIVISOR; // B98
      OUT.push({
        title: "Hydrogen Dilution System",
        cards: [
          card("H2 Generation Rate", h2GenerationRate.toFixed(3), "kg/hr"),
          card("H2 Volume at STP", h2VolumeSTP.toFixed(0), "L/hr"),
          card("Minimum Ventilation Air (< 2% v/v target)", minVentilationAir.toFixed(1), "m3/hr"),
        ],
      });

      /* =====================================================================
         Selected/rounded equipment sizes used by the Process datasheet
         (doc Section 5.2) and BOQ (doc Section 6).
      ===================================================================== */
      const brineTransferPumpM3Hr = CEILING((brineCirculationPump * 60 * 1.2) / 1000, 10);
      const dosingPumpCapacity = CEILING(dosingFlowLPH * 1.2, 10);
      const ventBlower = CEILING(minVentilationAir, 10);
      const electrolyzerCellGHr = Cl_d * 1000; // B17 x 1000

      /* =====================================================================
         4.1 RESULTS SUMMARY — results at a glance, all linked from the
         figures above (doc Section 4.1).
      ===================================================================== */
      OUT.push({
        title: "4.1 Results Summary",
        cards: [
          card("Water Flow Rate", Q.toFixed(1), "m3/hr"),
          card("Cl2 Dose", Dcl, "mg/L"),
          card("Operating Hours", Hop, "hr/day"),
          card("Net Cl2 Demand", netCl2.toFixed(2), "kg/hr"),
          card("Design Cl2 (with margin)", Cl_d, "kg/hr"),
          card("Daily Cl2 Demand", dailyCl2.toFixed(1), "kg/day"),
          card("NaCl Required (Specific)", naclPerKgCl2.toFixed(2), "kg NaCl / kg Cl2"),
          card("Feed Water Required (Specific)", waterPerKgCl2.toFixed(1), "L / kg Cl2"),
          card("Electrolysis Power (Specific)", powerPerKgCl2.toFixed(2), "kWh / kg Cl2"),
          card("NaOCl Solution Produced", naoclProducedLHr.toFixed(1), "L/hr"),
          card("NaCl Consumption (As-Supplied)", naclConsumptionAsSupplied.toFixed(1), "kg/hr"),
          card("Brine Dilution Water", brineDilutionWater.toFixed(1), "L/hr"),
          card("Salt Saturation Water", saltSaturationWater.toFixed(1), "L/hr"),
          card("Total Softened Feed Water", totalSoftenedFeedWater.toFixed(1), "L/hr"),
          card("Electrolysis Power Draw", powerConsumption.toFixed(1), "kW"),
          card("Total Connected Load (AC)", totalConnectedLoad.toFixed(1), "kW"),
          card("Daily NaCl", dailyNaCl.toFixed(1), "kg/day"),
          card("Daily Power", dailyPower.toFixed(1), "kWh/day"),
          card("Cell Housing Working Volume", cellHousingWorkingVol, "L"),
          card("Salt Saturation Working Volume", saltSaturationWorkingVol, "L"),
          card("Salt Dilution Working Volume", dilutionTankWorkingVol, "L"),
          card("NaOCl Storage per Tank", selectedTankSize, "L"),
          card("No. of Dosing Pumps", "2 (redundant)", ""),
          card("Dosing Pump", dosingFlowLPH.toFixed(1), "L/hr"),
        ],
      });

      /* =====================================================================
         4.2 EQUIPMENT SUMMARY — 8-group datasheet (doc Section 4.2), sizes
         linked from the figures above; the rest is fixed vendor/engineering
         text as documented.
      ===================================================================== */
      OUT.push({
        title: "4.2 Equipment Summary",
        cards: [
          card("System Capacity", Cl_d, "kg/hr"),
          card("System Type", "Continuous type", ""),
          card("1. Electrolyzer Cells — Cell Housing Working Volume", cellHousingWorkingVol, "L"),
          card("2. DC Power Rectifier — AC Input / Total Connected Load", `${acPowerInput.toFixed(1)} / ${totalConnectedLoad.toFixed(1)}`, "kW"),
          card("3. Water Softener — Service Flow", softenerServiceFlow.toFixed(2), "m3/hr"),
          card("4. Salt Storage & Dissolver — Saturation / Dissolver Volume", `${saltSaturationVol7d.toFixed(0)} / ${dilutionTank8Hr.toFixed(0)}`, "L"),
          card("5. NaOCl Product Storage — Volume per Tank", selectedTankSize, "L"),
          card("6. Dosing Pumps — Dosing Flow", (naoclProducedLHr / 60).toFixed(2), "L/min"),
          card("7. Hydrogen Dilution", "Fans + ATEX blower, < 2% v/v target", ""),
          card("8. Instrumentation & Control", "Flow / Temp / Level, Cl2 analyser, PLC", ""),
        ],
      });

      /* =====================================================================
         5. PROCESS DATASHEET (RSVP Chlorotech) — "<Cl_d> KG/HR
         ELECTROCHLORINATION SYSTEM". Restates the design using
         selected/rounded sizes suitable for a quotation (doc Section 5).
      ===================================================================== */
      OUT.push({
        title: "5.1 Process Datasheet — System Specification",
        cards: [
          card("System Capacity", Cl_d, "kg/hr"),
          card("System Type", "Continuous type", ""),
          card("Sodium Hypochlorite Generated", naoclProducedLHr.toFixed(1), "L/hr"),
          card("Product Strength", "6000 - 8000", "ppm"),
          card("Max Feed-Water Hardness", E10, "mg/L"),
          card("Salt Consumption", naclConsumptionAsSupplied.toFixed(2), "kg/hr"),
          card("Salt Saturation Water", saltSaturationWater.toFixed(1), "L/hr"),
          card("Brine Conc. (Saturation Tank)", 300, "g/L"),
          card("Brine Conc. (Dilution Tank)", 30, "g/L"),
          card("Dilution Water Requirement", brineDilutionWater.toFixed(1), "L/hr"),
          card("Acid Required for Cleaning", acidRequired.toFixed(0), "L"),
          card("Min Feed-Water Pressure", 4, "kg/cm2"),
          card("Operation", "Automatic", ""),
          card("Operating Cycle", Hop, "hr"),
          card("Design Temperature", 60, "°C"),
          card("Power Supply", "415 V / 3Ph / 50 Hz", ""),
          card("Total Connected Load", totalConnectedLoad.toFixed(1), "kW"),
        ],
      });

      OUT.push({
        title: "5.2 Process Datasheet — Equipment Specification (Selected Sizes)",
        cards: [
          card(`Brine Saturation Tank (${SALT_SAT_STORAGE_DAYS} days)`, saltSaturationWorkingVol, "L"),
          card(`Dilution Water Tank (${DILUTION_HOLDUP_HR} hr)`, dilutionTankWorkingVol, "L"),
          card(`Sodium Hypochlorite Tank (${PRODUCT_HOLDUP_HR} hr)`, selectedTankSize, "L"),
          card("Electrolyzer Cell Housing (1 hr)", cellHousingWorkingVol, "L"),
          card("Electrolyzer Cell", electrolyzerCellGHr.toFixed(0), "g/hr"),
          card("Brine Transfer / Circ. Pump (1W+1S)", brineTransferPumpM3Hr, "m3/hr"),
          card("Dosing Pump", "1W + 1S", "nos"),
          card("Dosing Pump Capacity", dosingPumpCapacity, "LPH"),
          card("Vent Blower (H2 < 2%)", ventBlower, "m3/hr"),
          card("Acid Dosing Pump", acidDosingPump.toFixed(0), "LPH"),
          card("Acid Tank", acidStorageTank, "L"),
        ],
      });

      OUT.push({
        title: "5.3 Process Datasheet — Materials of Construction (MOC)",
        cards: [
          card("Electrodes", "Titanium with MMO (mixed metal oxide) coating", ""),
          card("Tanks", "PP / FRP", ""),
          card("Piping & Valves", "UPVC / CPVC / HDPE", ""),
          card("Dosing Pump", "PVDF / PP / PTFE", ""),
          card("Rectifier Panel", "Powder-coated MS", ""),
        ],
      });

      /* =====================================================================
         BOQ — single combined system BOQ (doc Section 6, items 1-34; items
         35-36 are supply battery-limit notes, not purchasable line items,
         and are covered by the Design Report Remark instead).
      ===================================================================== */
      const boqVars = {
        dailySalt7d: Math.ceil(dailySaltConsumption * SALT_SAT_STORAGE_DAYS),
        saltSaturationWorkingVol,
        dilutionTankWorkingVol,
        brineTransferPumpM3Hr,
        requiredChillerCapacity: requiredChillerCapacity.toFixed(1),
        selectedTankSize,
        dosingPumpCapacity,
        ventBlower,
        acidStorageTank,
        acidDosingPump: acidDosingPump.toFixed(0),
        totalConnectedLoad: totalConnectedLoad.toFixed(1),
      };

      const BOQ = buildElectrochlorinatorBoqAreas(boqVars);
      return {
        groups: OUT,
        boq: BOQ,
        capacity: Cl_d,
        warn: B8 <= 0 && netCl2 > 0 && Cl_d - netCl2 > 0.5 * Cl_d ? `Design Cl2 is rounded up from ${netCl2.toFixed(2)} to ${Cl_d} kg/hr. Enter a capacity override if the client stated one.` : "",
        headline: `${Cl_d} kg/hr Cl2 · ${totalConnectedLoad.toFixed(1)} kW connected · ${dailySaltConsumption.toFixed(0)} kg salt/day`,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  function boqItem(name, spec, moc, qty, unit) {
    return { item: name, specification: spec === undefined || spec === null ? "-" : spec, moc: moc || "-", qty, unit: unit || "nos", price: "" };
  }

  function electrochlorinatorSystemItems(v) {
    return [
      boqItem("Automatic water softener", "Hardness < 5 ppm", "FRP vessel, UPVC internals", 1, "nos"),
      boqItem("Ball valve", "Full-bore isolation, suitable size", "UPVC", 12, "nos"),
      boqItem("Agitator with motor", "Top-mounted, SS316 shaft, geared motor", "SS316 shaft, PP impeller", 1, "nos"),
      boqItem("Salt loading hopper", `Manual salt charging (~${v.dailySalt7d} kg for 7 days)`, "HDPE / PP", 1, "nos"),
      boqItem("Brine saturation tank", `Vertical, saturated brine storage (${v.saltSaturationWorkingVol} L / 7 d)`, "HDPE", 1, "nos"),
      boqItem("Level gauge", "Transparent tubular sight gauge", "Acrylic tube", 1, "nos"),
      boqItem("Coarse basket strainer", "300-500 µm mesh, flanged/threaded", "UPVC body, SS316 basket", 1, "nos"),
      boqItem("Brine dilution tank", `Saturated brine -> 30 g/L (${v.dilutionTankWorkingVol} L / 8 hr)`, "HDPE", 1, "nos"),
      boqItem("Inline static mixer", "For brine homogenisation", "UPVC / PVC-U", 1, "nos"),
      boqItem("Brine circulation pump", `Corrosion resistant, ${v.brineTransferPumpM3Hr} m3/hr`, "PP / PVDF wetted parts", 1, "nos"),
      boqItem("Pressure relief valve", "Adjustable spring-loaded", "UPVC / PVC", 1, "nos"),
      boqItem("Pressure gauge", "0-6 bar, glycerine filled", "SS316", 1, "nos"),
      boqItem("Plate heat exchanger", "Titanium plates, gasketed", "Titanium", 1, "nos"),
      boqItem("Temperature indicator", "Digital, RTD PT100, local display", "SS316 probe", 2, "nos"),
      boqItem("Chiller unit", `Air-cooled + circ. pump (${v.requiredChillerCapacity} kW)`, "Standard industrial", 1, "nos"),
      boqItem("Actuated flow control valve", "Electrically actuated modulating", "UPVC body", 1, "nos"),
      boqItem("Flow meter", "0-200 LPH", "PP liner / SS316 electrodes", 2, "nos"),
      boqItem("Electrolysis cell housing", "Cell with MMO-coated Ti electrodes", "PVC/FRP + Ti-MMO", 1, "nos"),
      boqItem("NaOCl storage tank", `Store generated NaOCl (${v.selectedTankSize} L / 12 hr)`, "HDPE", 1, "nos"),
      boqItem("High level switch", "Float type", "PP", 1, "nos"),
      boqItem("Low level switch", "Float type", "PP", 2, "nos"),
      boqItem("NaOCl dosing pump", `Diaphragm metering (${v.dosingPumpCapacity} LPH)`, "PVDF head, PTFE diaphragm", 1, "nos"),
      boqItem("Mixing tee", "Hydrogen-air mixing tee", "PVC-U", 1, "nos"),
      boqItem("Air filter", "Blower inlet air filter", "GI / Aluminium housing", 1, "nos"),
      boqItem("Air blower", `Centrifugal blower (${v.ventBlower} m3/hr)`, "Aluminium / MS powder-coated", 1, "nos"),
      boqItem("Non-return valve", "Spring-loaded check valve", "UPVC", 2, "nos"),
      boqItem("Vent chamber", "Hydrogen dilution & vent chamber", "FRP", 1, "nos"),
      boqItem("Acid cleaning tank", `Acid preparation/cleaning (${v.acidStorageTank} L)`, "HDPE", 1, "nos"),
      boqItem("Acid dosing pump", `Diaphragm metering (${v.acidDosingPump} LPH)`, "PVDF head, PTFE diaphragm", 1, "nos"),
      boqItem("Three-way valve", "Manual diverter", "UPVC", 1, "nos"),
      boqItem("Manual flow control valve", "Needle / globe regulating valve", "UPVC", 1, "nos"),
      boqItem("Rectifier panel", `AC->DC SCR thyristor (${v.totalConnectedLoad} kW)`, "Powder-coated CRCA", 1, "nos"),
      boqItem("PLC control panel", "Controls all instruments", "Powder-coated CRCA", 1, "nos"),
      boqItem("Conductivity indicator", "Online transmitter + sensor", "SS316 / graphite, IP65", 1, "nos"),
    ];
  }

  function buildElectrochlorinatorBoqAreas(v) {
    return [{ area: "Electrochlorinator System (Complete)", scopeKey: "system", items: electrochlorinatorSystemItems(v) }];
  }

  function sections(v, ts) {
    const out = [];
    INPUT_GROUPS.forEach(g => g.sections.forEach(s => out.push({
      ...s, group: g.group,
      fields: s.fields.map(f => f.id === 'B10' && ts && ts.naoclConc != null ? { ...f, value: ts.naoclConc } : f),
    })));
    out.push({ group: 'BOQ & Report', title: 'BOQ Configuration', note: 'RSVP Scope: supplied by RSVP and included in the BOQ. Client Scope: supplied by the client, so quantities are zeroed.', fields: [F('boqScope_system', 'Electrochlorinator System (Complete)', '', 'RSVP', 'select', BOQ_SCOPE_OPTS)] });
    out.push({ group: 'BOQ & Report', title: 'Design Report Remark', fields: [F('designReportRemark', 'Remark', '', CALC_REMARK + '\nBattery limits: input power supply (415V/3Ph/50Hz) and input water (potable/filtered) to be provided by client.', 'textarea')] });
    return out;
  }

  // Calculations saved by the earlier, simplified electrochlorinator calculator used different field names
  function migrate(i) {
    if (!i || i.B6 != null || i.flow == null) return i;
    const map = { flow: 'B6', unit: 'C6', dose: 'B9', override: 'B8', hop: 'E7', hdose: 'E9', cp: 'B10', ps: 'B11', nb: 'B24', wb: 'B25', pb: 'B26' };
    const o = {};
    Object.entries(map).forEach(([a, b]) => { if (i[a] != null) o[b] = i[a]; });
    return o;
  }

  return { sections, compute(v) { CUR = v; return calculate(); }, migrate };
})();

/* ============================== Electrochlorinator (batch) ============================== */
const BATCH_ENGINE = (() => {
  let CUR = {};
  function getBatchNum(id) { const v = parseFloat(CUR[id]); return isNaN(v) ? 0 : v; }
  function getBatchText(id) { return CUR[id] == null ? '' : String(CUR[id]); }

  function BF(id, label, unit, value, type, opts) {
    return { id, label, unit: unit || "", value, type: type || "num", opts };
  }

  const BATCH_INPUT_GROUPS = [
    {
      group: "System Inputs",
      sections: [
        {
          title: "Design Basis (Section 1)",
          fields: [
            BF("BB6", "Flow Rate to Treat", "", 40000),
            BF("BC6", "Flow Rate Unit", "", "ltr/hr", "select", ["ltr/hr", "m3/hr", "MLD"]),
            BF("BE8", "Operating Hours/Day (Batch Cycle)", "hr/day", 8),
            BF("BB8", "Capacity Required (If Client Stated) — leave 0 to size from flow", "g/hr", 0),
            BF("BB9", "Cl2 Dose Required", "mg/L", 3),
            BF("BE9", "Design Margin Factor", "", 1.2),
            BF("BB10", "NaOCl Product Concentration (Cell Out)", "g/L", 6),
            BF("BE10", "Days Product Storage", "days", 1.5),
            BF("BB11", "Salt Purity (NaCl)", "%", 99),
            BF("BE11", "Feed-Water Hardness (Max)", "mg/L as CaCO3", 50),
            BF("BB12", "Feed-Water Pressure (Min)", "kg/cm2", 4),
            BF("BE12", "Min Feed-Water Temp", "°C", 15),
            // Family B — Casson & Bess (2006) paper-basis constants (Section
            // 3.2 of the doc). Folded into Design Basis (no separate
            // "Casson & Bess" heading) but still user-editable.
            BF("BB24", "NaCl per Batch", "kg", 1.588),
            BF("BB25", "Water per Batch", "L", 56.8),
            BF("BB26", "Power per Batch", "kWh", 2.5),
          ],
        },
      ],
    },
  ];

  /* ---------------------------------------------------------------------
     Family C — embedded engineering assumptions (Section 3.3 of the doc).
     Baked into the formulas rather than exposed as input cells, matching
     the source workbook.
  --------------------------------------------------------------------- */
  const BATCH_BRINE_DENSITY = 1.017; // kg/L, 30 g/L brine @ 30°C
  const BATCH_TANK_ASPECT_RATIO = 1.45; // prep-tank H/D
  const BATCH_RECTIFIER_EFFICIENCY = 0.82;
  const BATCH_AUX_LOAD_ALLOWANCE = 0.15;
  const BATCH_H2_STOICH_NUM = 2.016;
  const BATCH_H2_STOICH_DEN = 70.9;
  const BATCH_MOLAR_VOLUME_STP = 22.4;
  const BATCH_H2_VENTILATION_DIVISOR = 20; // ventilation air = H2 volume / 20 (2% v/v target)
  const BATCH_CL2_ROUND_STEP = 0.05; // kg/hr (50 g) — batch-specific rounding step
  const BATCH_OVERFLOW_HEIGHT_RATIO = 0.823; // overflow nozzle height / prep-tank HT
  const BATCH_STANDARD_TOTE_SIZES = [100, 150, 225, 300, 400, 525, 725]; // L, Sheet2
  const BATCH_TOTE_DIMENSIONS = {
    100: "750 x 550 x 315",
    150: "850 x 620 x 340",
    225: "965 x 739 x 389",
    300: "1050 x 750 x 450",
    400: "1140 x 800 x 500",
    525: "1200 x 850 x 600",
    725: "1300 x 900 x 700",
  };
  const BATCH_ELECTRODE_SIZES_G_HR = [15, 25, 50, 100, 150, 200, 250, 300, 350, 375, 400]; // Sheet1, tops out at 400 g/hr

  function BATCH_CEILING(x, s) {
    return Math.ceil(x / s) * s;
  }
  function BATCH_MROUND(x, s) {
    return Math.round(x / s) * s;
  }
  function selectBatchElectrode(gPerHr) {
    // Round first — see selectBatchTote for why (fractional g/hr from
    // floating-point division can otherwise skip an exact standard size).
    const rounded = Math.round(gPerHr);
    return BATCH_ELECTRODE_SIZES_G_HR.find((size) => size >= rounded) || null;
  }
  function selectBatchTote(litres) {
    // Round to the nearest litre first — the upstream chain of divisions
    // (Cl_d/Cp * Hb * Dstore) can land a fraction of a litre above an exact
    // standard size (e.g. 300.00000000000006), which would otherwise skip
    // straight past that size to the next one up.
    const rounded = Math.round(litres);
    return BATCH_STANDARD_TOTE_SIZES.find((size) => size >= rounded) || BATCH_STANDARD_TOTE_SIZES[BATCH_STANDARD_TOTE_SIZES.length - 1];
  }

  function calculate() {
    try {
      const OUT = [];
      const card = (label, value, unit, flag, internal) => ({ label, value, unit: unit || "", flag, internal: Boolean(internal) });

      /* ---- Inputs ---- */
      const B6 = getBatchNum("BB6"), C6 = getBatchText("BC6");
      const E8 = getBatchNum("BE8"), B8 = getBatchNum("BB8");
      const B9 = getBatchNum("BB9"), E9 = getBatchNum("BE9"), B10 = getBatchNum("BB10");
      const E10 = getBatchNum("BE10"), B11 = getBatchNum("BB11");
      const E11 = getBatchNum("BE11"), B12 = getBatchNum("BB12"), E12 = getBatchNum("BE12");
      const B24 = getBatchNum("BB24"), B25 = getBatchNum("BB25"), B26 = getBatchNum("BB26");

      if (B10 <= 0) throw new Error("NaOCl product concentration (Cp) must be greater than 0");
      if (B11 <= 0) throw new Error("Salt purity (Ps) must be greater than 0");
      if (E8 <= 0) throw new Error("Operating hours/day (batch cycle) must be greater than 0");
      if (E10 <= 0) throw new Error("Days product storage must be greater than 0");

      // Q — flow rate normalised to m3/hr
      const Q = C6 === "MLD" ? (B6 * 1000000) / 24 / 1000 : C6 === "ltr/hr" ? B6 / 1000 : B6;

      const Cp = B10, Ps = B11, Hb = E8, Nb = B24, Wb = B25, Pb = B26, Mf = E9 || 1;
      const Dcl = B9, Dstore = E10;

      /* =====================================================================
         CHLORINE DEMAND
      ===================================================================== */
      const netCl2 = (Q * Dcl) / 1000; // kg/hr, unmargined
      // Design Cl2 (margin fix applied): CEILING(net x Mf, 0.05), or the
      // client-stated capacity (B8, g/hr) taken as-is if entered.
      const Cl_d = B8 > 0 ? B8 / 1000 : BATCH_CEILING(netCl2 * Mf, BATCH_CL2_ROUND_STEP);
      const dailyCl2 = Cl_d * Hb;
      const cl2PerMin = (Q * Dcl) / 60;
      const capacityGPerHr = Cl_d * 1000;
      const selectedElectrode = selectBatchElectrode(capacityGPerHr);

      OUT.push({
        title: "Chlorine Demand",
        cards: [
          card("Flow Rate to Treat (normalised)", Q.toFixed(2), "m3/hr"),
          card("Cl2 Demand (net)", netCl2.toFixed(3), "kg/hr"),
          card("Design Cl2 (net x margin factor, 0.05 kg step)", Cl_d.toFixed(2), "kg/hr"),
          card("Capacity Basis", B8 > 0 ? "Client-Stated (Override)" : "Calculated from Water Duty x Margin", ""),
          card("Daily Cl2 Demand", dailyCl2.toFixed(2), "kg/day"),
          card("Cl2 Demand per Minute", cl2PerMin.toFixed(2), "g/min"),
        ],
      });

      /* =====================================================================
         SPECIFIC CONSUMPTION (paper basis, per kg Cl2)
      ===================================================================== */
      const cl2PerBatch = (Cp * Wb) / 1000;
      const naclPerKgCl2 = (1000 * Nb) / (Cp * Wb);
      const waterPerKgCl2 = 1000 / Cp;
      const powerPerKgCl2 = (1000 * Pb) / (Cp * Wb);
      OUT.push({
        title: "Specific Consumption (Paper Basis, per kg Cl2)",
        cards: [
          card("Cl2 per Batch (Paper)", cl2PerBatch.toFixed(3), "kg Cl2"),
          card("NaCl per kg Cl2", naclPerKgCl2.toFixed(3), "kg/kg"),
          card("Water per kg Cl2", waterPerKgCl2.toFixed(1), "L/kg"),
          card("Power per kg Cl2", powerPerKgCl2.toFixed(3), "kWh/kg"),
        ],
      });

      /* =====================================================================
         HOURLY & PER-BATCH PROCESS FLOWS
      ===================================================================== */
      const naoclProducedLHr = (1000 * Cl_d) / Cp;
      const naclConsumptionAsSupplied = (100000 * Cl_d * Nb) / (Cp * Wb * Ps);
      const naclConsumptionPerBatch = naclConsumptionAsSupplied * Hb;
      const totalSoftenedFeedWater = (1000 * Cl_d) / Cp;
      const feedWaterPerBatch = (1000 * Cl_d * Hb) / Cp;
      const powerConsumption = (1000 * Cl_d * Pb) / (Cp * Wb);
      const powerPerBatch = (1000 * Cl_d * Pb * Hb) / (Cp * Wb);
      OUT.push({
        title: "Hourly & Per-Batch Process Flows",
        cards: [
          card("NaOCl Solution Produced", naoclProducedLHr.toFixed(1), "L/hr"),
          card("NaCl Consumption (As-Supplied)", naclConsumptionAsSupplied.toFixed(3), "kg/hr"),
          card("NaCl Consumption per Batch", naclConsumptionPerBatch.toFixed(2), "kg/batch"),
          card("Total Softened Feed Water", totalSoftenedFeedWater.toFixed(1), "L/hr"),
          card("Feed Water per Batch", feedWaterPerBatch.toFixed(1), "L/batch"),
          card("Power Consumption", powerConsumption.toFixed(3), "kW"),
          card("Power per Batch", powerPerBatch.toFixed(2), "kWh/batch"),
        ],
      });

      /* =====================================================================
         SALT STORAGE & PREPARATION (single tank — dissolve + electrolyse)
      ===================================================================== */
      const saltPerBatch = naclConsumptionPerBatch;
      const waterPerBatch = feedWaterPerBatch;
      const prepTankCapacity = ((Cl_d * Hb) / Cp) * (1000 + (100000 * Nb) / (Wb * Ps)) / BATCH_BRINE_DENSITY;
      const prepTankFreeboardVol = BATCH_MROUND(prepTankCapacity * Mf, 10);
      OUT.push({
        title: "Salt Storage & Preparation (Single Tank)",
        cards: [
          card("Salt per Batch", saltPerBatch.toFixed(2), "kg/batch"),
          card("Water per Batch", waterPerBatch.toFixed(1), "L/batch"),
          card("Preparation Tank Capacity", prepTankCapacity.toFixed(1), "L"),
          card("Prep Tank (with Margin Freeboard)", prepTankFreeboardVol, "L"),
        ],
      });

      /* =====================================================================
         PREPARATION-TANK DIMENSIONS (aspect ratio H/D = 1.45)
      ===================================================================== */
      const prepTankID = BATCH_MROUND(Math.cbrt((4 * prepTankFreeboardVol) / 1000 / (BATCH_TANK_ASPECT_RATIO * Math.PI)) * 1000, 25);
      const prepTankHT = BATCH_CEILING(prepTankID * BATCH_TANK_ASPECT_RATIO, 25);
      const overflowHeight = BATCH_MROUND(prepTankHT * BATCH_OVERFLOW_HEIGHT_RATIO, 10);
      OUT.push({
        title: "Preparation-Tank Dimensions",
        cards: [
          card("Internal Diameter (ID)", prepTankID, "mm"),
          card("Height (HT)", prepTankHT, "mm"),
          card("Overflow Nozzle Height", overflowHeight, "mm"),
        ],
      });

      /* =====================================================================
         PRODUCT (NaOCl) STORAGE — standard tote from Sheet2
      ===================================================================== */
      const naoclProducedPerHour = naoclProducedLHr;
      const storageVolumeRequired = (1000 * Cl_d * Hb * Dstore) / Cp;
      const selectedTankCapacity = selectBatchTote(storageVolumeRequired);
      const toteDims = BATCH_TOTE_DIMENSIONS[selectedTankCapacity] || "-";
      OUT.push({
        title: "Product (NaOCl) Storage",
        cards: [
          card("NaOCl Produced per Hour", naoclProducedPerHour.toFixed(1), "L/hr"),
          card(`Storage Volume Required (${Dstore} day${Dstore === 1 ? "" : "s"})`, storageVolumeRequired.toFixed(0), "L"),
          card("Selected Tank Capacity", selectedTankCapacity, "L"),
          card("Tank L x W x H", toteDims, "mm"),
        ],
      });

      /* =====================================================================
         DC POWER RECTIFIER
      ===================================================================== */
      const totalElectrolysisPower = (1000 * Cl_d * Pb) / (Cp * Wb);
      const acPowerInput = totalElectrolysisPower / BATCH_RECTIFIER_EFFICIENCY;
      const auxLoads = acPowerInput * BATCH_AUX_LOAD_ALLOWANCE;
      const totalConnectedLoad = (totalElectrolysisPower * (1 + BATCH_AUX_LOAD_ALLOWANCE)) / BATCH_RECTIFIER_EFFICIENCY;
      OUT.push({
        title: "DC Power Rectifier",
        cards: [
          card("Total Electrolysis Power", totalElectrolysisPower.toFixed(3), "kW"),
          card("AC Power Input Required", acPowerInput.toFixed(3), "kW"),
          card(`Auxiliary Loads (${(BATCH_AUX_LOAD_ALLOWANCE * 100).toFixed(0)}%)`, auxLoads.toFixed(3), "kW"),
          card("Total Connected Load", totalConnectedLoad.toFixed(3), "kW"),
        ],
      });

      /* =====================================================================
         DOSING PUMPS
      ===================================================================== */
      const dosingFlowLPM = (1000 * Cl_d) / (60 * Cp);
      const dosingPumpCapacity = BATCH_CEILING((1000 * Cl_d) / Cp, 10);
      OUT.push({
        title: "Dosing Pumps",
        cards: [
          card("NaOCl Dosing Flow", dosingFlowLPM.toFixed(3), "L/min"),
          card("Selected Dosing Capacity", dosingPumpCapacity, "LPH"),
        ],
      });

      /* =====================================================================
         HYDROGEN DILUTION SYSTEM
      ===================================================================== */
      const h2GenerationRate = (Cl_d * BATCH_H2_STOICH_NUM) / BATCH_H2_STOICH_DEN;
      const h2VolumeSTP = (Cl_d * BATCH_MOLAR_VOLUME_STP * 1000) / BATCH_H2_STOICH_DEN;
      const minVentilationAir = h2VolumeSTP / BATCH_H2_VENTILATION_DIVISOR;
      OUT.push({
        title: "Hydrogen Dilution System",
        cards: [
          card("H2 Generation Rate", h2GenerationRate.toFixed(5), "kg/hr"),
          card("H2 Volume at STP", h2VolumeSTP.toFixed(2), "L/hr"),
          card("Minimum Ventilation Air (2% v/v target)", minVentilationAir.toFixed(3), "m3/hr"),
        ],
      });

      /* =====================================================================
         RESULTS SUMMARY (Section 5 of doc — results at a glance)
      ===================================================================== */
      OUT.push({
        title: "Results Summary",
        cards: [
          card("Water Flow Rate", Q.toFixed(1), "m3/hr"),
          card("Cl2 Dose", Dcl, "mg/L"),
          card("Operating Hours", Hb, "hr/day"),
          card("Design Cl2 (with margin)", Cl_d.toFixed(2), "kg/hr"),
          card("Daily Cl2 Demand", dailyCl2.toFixed(2), "kg/day"),
          card("NaCl Required (Specific)", naclPerKgCl2.toFixed(2), "kg NaCl / kg Cl2"),
          card("Feed Water Required (Specific)", waterPerKgCl2.toFixed(1), "L / kg Cl2"),
          card("Electrolysis Power (Specific)", powerPerKgCl2.toFixed(2), "kWh / kg Cl2"),
          card("NaOCl Solution Produced", naoclProducedLHr.toFixed(1), "L/hr"),
          card("NaCl Consumption", naclConsumptionAsSupplied.toFixed(2), "kg/hr"),
          card("Feed Water per Batch", feedWaterPerBatch.toFixed(1), "L/batch"),
          card("Salt Dissolved per Batch", saltPerBatch.toFixed(2), "kg/batch"),
          card("Total Brine Fed per Batch", prepTankCapacity.toFixed(1), "L/batch"),
          card("Electrolysis Power Draw", powerConsumption.toFixed(2), "kW"),
          card("Total Connected Load (AC)", totalConnectedLoad.toFixed(2), "kW"),
          card("Preparation Tank Capacity", prepTankFreeboardVol, "L"),
          card("Prep Tank ID x HT", `${prepTankID} x ${prepTankHT}`, "mm"),
          card("Prep Tank Overflow Height", overflowHeight, "mm"),
          card("Selected Storage Tank", selectedTankCapacity, "L"),
          card("Storage Tank L x W x H", toteDims, "mm"),
          card("NaOCl Dosing Flow Required", dosingPumpCapacity, "LPH"),
        ],
      });

      /* =====================================================================
         BOQ — single combined system BOQ (24 lines, doc Section 7).
      ===================================================================== */
      const boqVars = {
        prepTankFreeboardVol,
        saltPerBatch: saltPerBatch.toFixed(2),
        selectedElectrode: selectedElectrode || "-",
        selectedTankCapacity,
        dosingPumpCapacity,
      };

      const BOQ = buildBatchElectrochlorinatorBoqAreas(boqVars);
      return {
        groups: OUT,
        boq: BOQ,
        capacity: Cl_d,
        warn: Cl_d > 0.4 ? `Design Cl2 of ${capacityGPerHr.toFixed(0)} g/hr is above the 400 g/hr batch range (no standard electrode). Use the Electrochlorinator (Continuous) calculator instead.` : "",
        headline: `${capacityGPerHr.toFixed(0)} g/hr Cl2 · ${selectedTankCapacity} L storage tank · ${totalConnectedLoad.toFixed(2)} kW connected`,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  function batchBoqItem(name, spec, moc, qty, unit) {
    return { item: name, specification: spec === undefined || spec === null ? "-" : spec, moc: moc || "-", qty, unit: unit || "nos", price: "" };
  }

  function batchElectrochlorinatorSystemItems(v) {
    return [
      batchBoqItem("Brine preparation / electrolysis tank", `${v.prepTankFreeboardVol} L`, "PP / FRP", 1, "nos"),
      batchBoqItem("Salt charging chamber / hopper", `${v.saltPerBatch} kg salt capacity`, "PP / FRP", 1, "nos"),
      batchBoqItem("Electrode assembly (MMO Ti anode + Ti cathode)", `${v.selectedElectrode} g/hr chlorine generation`, "Titanium Gr-1 + MMO", 1, "set"),
      batchBoqItem("Electrode support bracket & terminal", "Bottom mounted", "PVC / PP / SS304", 1, "set"),
      batchBoqItem("Rectifier unit", "Wall mounted", "CRCA powder-coated", 1, "set"),
      batchBoqItem("DC power cables", "Suitable for 2 kW load", "Copper", 1, "lot"),
      batchBoqItem("Product transfer pipeline", 'Tank-to-tank transfer 1/2"', "UPVC SCH-80", 1, "lot"),
      batchBoqItem("Transfer valve (manual)", 'Manual isolation 1/2"', "UPVC / PVC-U", 1, "nos"),
      batchBoqItem("Sodium hypochlorite storage tank", `${v.selectedTankCapacity} L`, "PP / FRP", 1, "nos"),
      batchBoqItem("Civil foundation", "Floor-mounted assembly", "RCC", 1, "set"),
      batchBoqItem("Dosing pump — outlet 1", `${v.dosingPumpCapacity} LPH @ 4 kg/cm2`, "PP head, PTFE diaphragm", 1, "nos"),
      batchBoqItem("Isolation ball valves for dosing pumps", "Suction & discharge isolation", "UPVC", 2, "nos"),
      batchBoqItem("Storage-to-dosing pipeline", 'OD 1/2" / ID 3/8"', "LDPE", 1, "lot"),
      batchBoqItem("PLC control panel", "PLC-based with timer control", "CRCA powder-coated", 1, "set"),
      batchBoqItem("FRC analyser", "4-20 mA interface provision", "Hardwired / 4-20 mA", 1, "lot"),
      batchBoqItem("Internal instrument & power cabling", "Complete internal wiring", "Copper", 1, "lot"),
      batchBoqItem("Interconnecting fasteners", "Complete set", "SS304", 1, "lot"),
      batchBoqItem("Pipe supports & clamps", "Complete set", "SS304", 1, "lot"),
      batchBoqItem("Equipment name plates", "Engraved", "SS304", 1, "lot"),
      batchBoqItem("Input power supply", "230 V AC, 1Ph, 50 Hz", "-", 0, "-"),
      batchBoqItem("Input water (battery limit)", "Potable / filtered water", "-", 0, "-"),
    ];
  }

  function buildBatchElectrochlorinatorBoqAreas(v) {
    return [{ area: "Electrochlorinator (Batch) System (Complete)", items: batchElectrochlorinatorSystemItems(v) }];
  }

  function sections(v, ts) {
    const out = [];
    BATCH_INPUT_GROUPS.forEach(g => g.sections.forEach(s => out.push({
      ...s, group: g.group,
      fields: s.fields.map(f => f.id === 'BB10' && ts && ts.naoclConc != null ? { ...f, value: ts.naoclConc } : f),
    })));
    out.push({ group: 'Report', title: 'Design Report Remark', fields: [BF('designReportRemark', 'Remark', '', 'All calculations are based on input data provided.\nBatch type is applicable up to 400 g/hr (0.4 kg/hr) Cl2 — above this, use the Electrochlorinator (Continuous) system.\nDesign is subject to final verification during detailed engineering.', 'textarea')] });
    return out;
  }

  return { sections, compute(v) { CUR = v; return calculate(); } };
})();

const CALC_ENGINES = { gas: GAS_ENGINE, clo2: CLO2_ENGINE, electro: ELECTRO_ENGINE, batch: BATCH_ENGINE };
