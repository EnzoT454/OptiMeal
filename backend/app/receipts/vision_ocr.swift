// OCR local macOS. stdout contient uniquement les blocs JSON, origine en haut à gauche.
import Foundation
import Vision
import ImageIO

do {
    guard CommandLine.arguments.count == 2 else {
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
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["fr-FR", "en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
    let blocks: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": candidate.string, "confidence": candidate.confidence,
                "x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
    }
    let data = try JSONSerialization.data(withJSONObject: blocks, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data("OCR Vision : \(error.localizedDescription)\n".utf8))
    exit(1)
}
