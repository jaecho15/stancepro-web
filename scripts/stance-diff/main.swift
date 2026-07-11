import Foundation

// Differential-test driver: runs the REAL iOS engines over a shared case grid.
// Usage: harness <snowboard|ski> <cases.json> <rules.json|bundled> <out.json>

struct CaseOutput: Codable {
    var width: Double
    var front: String
    var rear: String
    var method: String
    var boardLength: Int
    var highback: String
    var shape: String
}

struct SkiCaseOutput: Codable {
    var skiLengthCm: Double
    var mountOffsetMm: Int
    var dinMin: Double?
    var dinMax: Double?
    var status: String?
    var reason: String?
    var weightCode: Int?
    var heightCode: Int?
    var baseCode: Int?
    var ageAdjustment: Int?
    var levelAdjustment: Int?
    var finalCode: Int?
    var finalCodeLetter: String?
    var bslBucket: String?
    var tableValue: Double?
    var mountNote: String
    var skiLengthNote: String
    var selectedTerrain: String
    var selectedSkillLevel: String
}

let args = CommandLine.arguments
guard args.count == 5, args[1] == "snowboard" || args[1] == "ski" else {
    FileHandle.standardError.write("usage: harness <snowboard|ski> <cases.json> <rules.json|bundled> <out.json>\n".data(using: .utf8)!)
    exit(1)
}

let mode = args[1]
let casesData = try Data(contentsOf: URL(fileURLWithPath: args[2]))
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

if mode == "snowboard" {
    let cases = try JSONDecoder().decode([SnowboardCalculationInput].self, from: casesData)
    let rules: SnowboardCalculationRules
    if args[3] == "bundled" {
        rules = .bundledDefaults
    } else {
        rules = try JSONDecoder().decode(SnowboardCalculationRules.self, from: Data(contentsOf: URL(fileURLWithPath: args[3])))
    }
    var outputs: [CaseOutput] = []
    outputs.reserveCapacity(cases.count)
    for input in cases {
        let r = StanceCalculationService.calculateResult(input: input, rules: rules)
        let shape = StanceCalculationService.recommendBoardShape(
            styleIndex: input.styleIndex,
            switchRiding: input.switchIndex,
            skillLevel: input.skillLevelIndex
        )
        outputs.append(CaseOutput(
            width: r.width, front: r.frontAngle, rear: r.rearAngle, method: r.method,
            boardLength: r.boardLength, highback: r.highbackLean, shape: shape
        ))
    }
    try encoder.encode(outputs).write(to: URL(fileURLWithPath: args[4]))
    print("swift harness (snowboard): \(outputs.count) cases")
} else {
    let cases = try JSONDecoder().decode([SkiCalculationInput].self, from: casesData)
    let rules: SkiCalculationRules
    if args[3] == "bundled" {
        rules = .bundledDefaults
    } else {
        rules = try JSONDecoder().decode(SkiCalculationRules.self, from: Data(contentsOf: URL(fileURLWithPath: args[3])))
    }
    var outputs: [SkiCaseOutput] = []
    outputs.reserveCapacity(cases.count)
    for input in cases {
        let r = SkiStanceCalculationService.calculateResult(input: input, rules: rules)
        let setup = r.skiSetup
        outputs.append(SkiCaseOutput(
            skiLengthCm: setup.skiLengthCm,
            mountOffsetMm: setup.mountOffsetMm,
            dinMin: setup.dinReferenceRange?.min,
            dinMax: setup.dinReferenceRange?.max,
            status: setup.dinTrace?.status,
            reason: setup.dinTrace?.reason,
            weightCode: setup.dinTrace?.weightCode,
            heightCode: setup.dinTrace?.heightCode,
            baseCode: setup.dinTrace?.baseCode,
            ageAdjustment: setup.dinTrace?.ageAdjustment,
            levelAdjustment: setup.dinTrace?.levelAdjustment,
            finalCode: setup.dinTrace?.finalCode,
            finalCodeLetter: setup.dinTrace?.finalCodeLetter,
            bslBucket: setup.dinTrace?.bslBucket,
            tableValue: setup.dinTrace?.tableValue,
            mountNote: setup.notes.mountNote,
            skiLengthNote: setup.notes.skiLengthNote,
            selectedTerrain: r.selectedTerrain,
            selectedSkillLevel: r.selectedSkillLevel
        ))
    }
    try encoder.encode(outputs).write(to: URL(fileURLWithPath: args[4]))
    print("swift harness (ski): \(outputs.count) cases")
}
