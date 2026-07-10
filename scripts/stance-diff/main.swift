import Foundation

// Differential-test driver: runs the REAL iOS engine over a shared case grid.
// Usage: harness <cases.json> <rules.json|bundled> <out.json>

struct CaseOutput: Codable {
    var width: Double
    var front: String
    var rear: String
    var method: String
    var boardLength: Int
    var highback: String
    var shape: String
}

let args = CommandLine.arguments
guard args.count == 4 else {
    FileHandle.standardError.write("usage: harness <cases.json> <rules.json|bundled> <out.json>\n".data(using: .utf8)!)
    exit(1)
}

let casesData = try Data(contentsOf: URL(fileURLWithPath: args[1]))
let cases = try JSONDecoder().decode([SnowboardCalculationInput].self, from: casesData)

let rules: SnowboardCalculationRules
if args[2] == "bundled" {
    rules = .bundledDefaults
} else {
    let rulesData = try Data(contentsOf: URL(fileURLWithPath: args[2]))
    rules = try JSONDecoder().decode(SnowboardCalculationRules.self, from: rulesData)
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
        width: r.width,
        front: r.frontAngle,
        rear: r.rearAngle,
        method: r.method,
        boardLength: r.boardLength,
        highback: r.highbackLean,
        shape: shape
    ))
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
try encoder.encode(outputs).write(to: URL(fileURLWithPath: args[3]))
print("swift harness: \(outputs.count) cases")
