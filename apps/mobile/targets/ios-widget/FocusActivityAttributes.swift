import ActivityKit
import Foundation

// ActivityKit matches an activity to its UI by the attributes type. The app target starts it
// through the kaihuman-shared pod, which carries its own copy of this struct
// (modules/kaihuman-shared/ios/KaihumanSharedModule.swift); a test keeps the two identical.
struct FocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startedAt: Date
        var plannedEnd: Date
    }

    var todoId: String
    var todoText: String
}
