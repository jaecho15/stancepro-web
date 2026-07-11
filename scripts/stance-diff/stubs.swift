import Foundation

// Minimal stubs so the REAL StanceCalculationService.swift and
// CalculationRulesModels.swift compile standalone for differential testing.
// None of these paths execute during calculateResult (equipment JSON is absent
// in a CLI bundle, so loadEquipmentData() returns nil and recommendBoards()
// returns []).

enum SportContext: String, Codable, CaseIterable {
    case snowboard
    case ski
}

// The REAL SkiStanceCalculationService.swift + SkiStanceResult.swift are now
// compiled into the harness (ski differential mode); it only needs the rules
// repository, which we pin to the bundled defaults.
final class CalculationRulesRepository {
    static let shared = CalculationRulesRepository()
    func skiRules() -> SkiCalculationRules { .bundledDefaults }
    func snowboardRules() -> SnowboardCalculationRules { .bundledDefaults }
}

struct StanceSetup {}
final class InputForCalc {}

extension Array {
    subscript(safeIndex index: Index) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}

struct WeightRangeValue: Codable {
    var min: Double
    var max: Double
}

enum SizeValue: Codable {
    case int(Int)
    case string(String)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            self = .int(intValue)
        } else {
            self = .string(try container.decode(String.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .int(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        }
    }
}

struct Board: Codable {
    var name: String
    var terrain: String?
    var levelRange: String?
    var sizes: [SizeValue]?
    var flex: String?
    var recommendedWeightKg: [String: WeightRangeValue]?
    var recommendedWeightString: String?
}

struct SnowboardBinding: Codable {
    var name: String?
}

struct Boot: Codable {
    var name: String?
}

struct EquipmentData: Codable {
    var boards: [Board]
    var bindings: [SnowboardBinding]
    var boots: [Boot]
}

struct LocalBoard: Codable { var name: String }
struct LocalBinding: Codable { var name: String? }
struct LocalBoot: Codable { var name: String? }

struct LocalEquipmentData: Codable {
    var boards: [LocalBoard]
    var bindings: [LocalBinding]
    var boots: [LocalBoot]
}

struct NewBoard: Codable {
    var brand: String
    var model: String
    var size: String
    var flex: String?
    var year: Int?
}

struct NewBoot: Codable {
    var brand: String
    var model: String
    var size: String
    var flex: String?
    var year: Int?
}

struct NewBinding: Codable {
    var brand: String
    var model: String
    var size: String
    var flex: String?
    var type: String?
    var compatibility: String?
    var year: Int?
}

struct BoardRecommendationParameters {
    var style: String
}

struct ProRider {
    var name: String
}

struct ProRiderData {
    var riders: [ProRider]
}

final class ProRiderDataService {
    static let shared = ProRiderDataService()

    func loadProRidersFromLocalBundleForLegacyUse() -> [ProRider]? { nil }
    func loadProRidersPreferSupabase() async -> [ProRider]? { nil }
    func getSimilarRiders(style: String, width: Double, frontAngle: String, rearAngle: String, height: Double) async -> [ProRider] { [] }
}

final class SupabaseManager {
    static let shared = SupabaseManager()

    func fetchBoots(completion: @escaping (Result<[Boot], Error>) -> Void) {
        completion(.success([]))
    }
    func fetchBoards(completion: @escaping (Result<[Board], Error>) -> Void) {
        completion(.success([]))
    }
    func fetchBindings(completion: @escaping (Result<[SnowboardBinding], Error>) -> Void) {
        completion(.success([]))
    }
    func fetchNewBoards(completion: @escaping (Result<[NewBoard], Error>) -> Void) {
        completion(.success([]))
    }
    func fetchNewBoots(completion: @escaping (Result<[NewBoot], Error>) -> Void) {
        completion(.success([]))
    }
    func fetchNewBindings(completion: @escaping (Result<[NewBinding], Error>) -> Void) {
        completion(.success([]))
    }
}
