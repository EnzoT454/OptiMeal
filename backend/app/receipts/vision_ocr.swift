// OCR local macOS. stdout contient uniquement les blocs JSON, origine en haut à gauche.
import Foundation
import Vision
import ImageIO

do {
    guard (2...3).contains(CommandLine.arguments.count) else {
        throw NSError(domain: "ReceiptOCR", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Une image est requise."])
    }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw NSError(domain: "ReceiptOCR", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "Image illisible."])
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let orientation = CGImagePropertyOrientation(rawValue:
        (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1) ?? .up
    let request = VNRecognizeTextRequest()
    let fast = CommandLine.arguments.contains("--fast")
    request.recognitionLevel = fast ? .fast : .accurate
    request.recognitionLanguages = fast ? ["en-US"] : ["fr-FR", "en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.003
    try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
    let blocks: [[String: Any]] = (request.results ?? []).enumerated().flatMap { index, observation -> [[String: Any]] in
        guard let candidate = observation.topCandidates(1).first else { return [] }
        let text = candidate.string
        let regex = try! NSRegularExpression(pattern: "\\S+")
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
            guard let range = Range(match.range, in: text),
                  let word = try? candidate.boundingBox(for: range) else { return nil }
            let box = word.boundingBox
            guard box.width > 0, box.height > 0 else { return nil }
            return ["text": String(text[range]), "confidence": candidate.confidence,
                    "x": max(0, min(1, box.minX)), "y": max(0, min(1, 1 - box.maxY)),
                    "width": min(1, box.width), "height": min(1, box.height),
                    "line_key": "vision:\(index)"]
        }
    }
    let data = try JSONSerialization.data(withJSONObject: blocks, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data("OCR Vision : \(error.localizedDescription)\n".utf8))
    exit(1)
}
