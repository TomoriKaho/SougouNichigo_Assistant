import Foundation
import PDFKit
import AppKit
import Vision

struct OCRLine: Codable {
    let text: String
    let left: Double
    let top: Double
    let width: Double
    let height: Double
    let confidence: Double
}

struct OCRPage: Codable {
    let pdfPage: Int
    let imagePath: String
    let imageWidth: Int
    let imageHeight: Int
    let lines: [OCRLine]
}

struct OCRDocument: Codable {
    let pdfPath: String
    let startPage: Int
    let endPage: Int
    let scale: Double
    let pages: [OCRPage]
}

func renderPage(_ page: PDFPage, scale: CGFloat) -> NSImage {
    let bounds = page.bounds(for: .mediaBox)
    let size = NSSize(width: bounds.width * scale, height: bounds.height * scale)
    return page.thumbnail(of: size, for: .mediaBox)
}

func pngData(from image: NSImage) throws -> Data {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let data = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "extract_vocab_ocr", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG"])
    }
    return data
}

func cgImage(from image: NSImage) throws -> CGImage {
    var rect = CGRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        throw NSError(domain: "extract_vocab_ocr", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create CGImage"])
    }
    return cgImage
}

func recognizeText(in image: NSImage) throws -> [OCRLine] {
    let cgImage = try cgImage(from: image)
    let width = Double(cgImage.width)
    let height = Double(cgImage.height)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ja-JP", "zh-Hans", "en-US"]
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    let observations = request.results ?? []
    return observations.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else {
            return nil
        }
        let box = observation.boundingBox
        let left = Double(box.minX) * width
        let top = (1.0 - Double(box.maxY)) * height
        let lineWidth = Double(box.width) * width
        let lineHeight = Double(box.height) * height
        return OCRLine(
            text: candidate.string,
            left: left,
            top: top,
            width: lineWidth,
            height: lineHeight,
            confidence: Double(candidate.confidence)
        )
    }
}

if CommandLine.arguments.count != 6 {
    fputs("Usage: extract_vocab_ocr <pdf_path> <start_page> <end_page> <image_dir> <output_json>\n", stderr)
    exit(1)
}

let pdfPath = CommandLine.arguments[1]
let startPage = Int(CommandLine.arguments[2])!
let endPage = Int(CommandLine.arguments[3])!
let imageDir = CommandLine.arguments[4]
let outputJSON = CommandLine.arguments[5]
let scale = 4.0

let pdfURL = URL(fileURLWithPath: pdfPath)
guard let document = PDFDocument(url: pdfURL) else {
    fputs("Failed to open PDF\n", stderr)
    exit(1)
}

try FileManager.default.createDirectory(atPath: imageDir, withIntermediateDirectories: true)

var pages: [OCRPage] = []

for pdfPage in startPage...endPage {
    let pageIndex = pdfPage - 1
    guard let page = document.page(at: pageIndex) else {
        fputs("Missing page \(pdfPage)\n", stderr)
        exit(1)
    }

    let image = renderPage(page, scale: CGFloat(scale))
    let imageName = String(format: "page_%03d.png", pdfPage)
    let imagePath = (imageDir as NSString).appendingPathComponent(imageName)
    let data = try pngData(from: image)
    try data.write(to: URL(fileURLWithPath: imagePath))

    let lines = try recognizeText(in: image)
    pages.append(
        OCRPage(
            pdfPage: pdfPage,
            imagePath: imagePath,
            imageWidth: Int(image.size.width),
            imageHeight: Int(image.size.height),
            lines: lines
        )
    )
}

let payload = OCRDocument(
    pdfPath: pdfPath,
    startPage: startPage,
    endPage: endPage,
    scale: scale,
    pages: pages
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
let json = try encoder.encode(payload)
try json.write(to: URL(fileURLWithPath: outputJSON))
