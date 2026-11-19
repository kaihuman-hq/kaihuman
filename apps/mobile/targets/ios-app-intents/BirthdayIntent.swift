import AppIntents
import Foundation

/// "What's the next birthday in kaihuman": answered from the cached snapshot, no app launch.
/// The app writes the next few birthdays (`.events.csv`) into the snapshot; the pick of the first
/// one that has not passed yet happens here so an old snapshot still answers correctly.
struct NextBirthdayIntent: AppIntent {
    static let title: LocalizedStringResource = "Next birthday"
    static let description = IntentDescription("Tells you whose birthday is next and when.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let snapshot = SharedTodoStore.shared.load() else {
            return .result(dialog: "Open kaihuman to sign in first.")
        }
        guard let next = SharedBirthday.next(in: snapshot.birthdays ?? [], from: Date()) else {
            return .result(dialog: "No upcoming birthdays found in kaihuman.")
        }
        let when = next.date.formatted(.dateTime.weekday(.wide).day().month(.wide))
        switch next.days {
        case 0:
            return .result(dialog: "\(next.name) has a birthday today.")
        case 1:
            return .result(dialog: "Next birthday: \(next.name), tomorrow, \(when).")
        default:
            return .result(dialog: "Next birthday: \(next.name), \(when), in \(next.days) days.")
        }
    }
}

extension SharedBirthday {
    /// First birthday on or after `now`'s calendar day, with the whole days left until it.
    static func next(
        in birthdays: [SharedBirthday], from now: Date, calendar: Calendar = .current
    ) -> (name: String, date: Date, days: Int)? {
        let today = calendar.startOfDay(for: now)
        for birthday in birthdays {
            let parts = birthday.date.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3,
                  let date = calendar.date(
                      from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
                  let days = calendar.dateComponents([.day], from: today, to: date).day,
                  days >= 0 else { continue }
            return (birthday.name, date, days)
        }
        return nil
    }
}
