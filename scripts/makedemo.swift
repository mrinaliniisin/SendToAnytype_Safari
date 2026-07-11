import Foundation
import CoreGraphics
import CoreText
import ImageIO

// Illustrated walkthrough of Send to Anytype, rendered to an animated GIF.
// Schematic (not a real screencast): a browser on the left, the extension
// panel on the right, stepping through click → select → pick → send → saved.

let W = 860, H = 500
let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/demo.gif"

func c(_ r: Int,_ g: Int,_ b: Int,_ a: CGFloat = 1) -> CGColor {
  CGColor(srgbRed: CGFloat(r)/255, green: CGFloat(g)/255, blue: CGFloat(b)/255, alpha: a)
}
let INK = c(25,25,25), SUB = c(120,120,128), BLUE = c(0,113,227)
let GREEN = c(28,124,46), LINE = c(228,228,234), PANELBG = c(248,248,250)
let WHITE = c(255,255,255), PAGEBG = c(252,252,253)

let cs = CGColorSpace(name: CGColorSpace.sRGB)!

func newCtx() -> CGContext {
  let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setAllowsAntialiasing(true); ctx.interpolationQuality = .high
  ctx.setFillColor(WHITE); ctx.fill(CGRect(x:0,y:0,width:W,height:H))
  ctx.translateBy(x: 0, y: CGFloat(H)); ctx.scaleBy(x: 1, y: -1) // y-down layout
  return ctx
}
func rr(_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat,_ r: CGFloat) -> CGPath {
  CGPath(roundedRect: CGRect(x:x,y:y,width:w,height:h), cornerWidth:r, cornerHeight:r, transform:nil)
}
func fillRR(_ ctx: CGContext,_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat,_ r: CGFloat,_ col: CGColor) {
  ctx.addPath(rr(x,y,w,h,r)); ctx.setFillColor(col); ctx.fillPath()
}
func strokeRR(_ ctx: CGContext,_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat,_ r: CGFloat,_ col: CGColor,_ lw: CGFloat = 1) {
  ctx.addPath(rr(x,y,w,h,r)); ctx.setStrokeColor(col); ctx.setLineWidth(lw); ctx.strokePath()
}
// Text: drawn in the flipped (y-down) space, so counter-flip locally.
func text(_ ctx: CGContext,_ s: String,_ x: CGFloat,_ y: CGFloat,_ size: CGFloat,_ col: CGColor, bold: Bool = false, center: Bool = false) {
  let name = (bold ? "Helvetica-Bold" : "Helvetica") as CFString
  let font = CTFontCreateWithName(name, size, nil)
  let attrs = [kCTFontAttributeName: font, kCTForegroundColorAttributeName: col] as CFDictionary
  let attr = CFAttributedStringCreate(nil, s as CFString, attrs)!
  let line = CTLineCreateWithAttributedString(attr)
  var ox = x
  if center {
    let wd = CTLineGetTypographicBounds(line, nil, nil, nil)
    ox = x - CGFloat(wd)/2
  }
  ctx.saveGState()
  ctx.textMatrix = .identity
  ctx.translateBy(x: ox, y: y); ctx.scaleBy(x: 1, y: -1)
  ctx.textPosition = .zero
  CTLineDraw(line, ctx)
  ctx.restoreGState()
}
// The charcoal app glyph (down-arrow into tray) at (x,y) size s.
func glyph(_ ctx: CGContext,_ x: CGFloat,_ y: CGFloat,_ s: CGFloat, ring: Bool = false) {
  fillRR(ctx, x, y, s, s, s*0.24, INK)
  ctx.setStrokeColor(WHITE); ctx.setLineWidth(s*0.08); ctx.setLineCap(.round); ctx.setLineJoin(.round)
  let cx = x + s/2
  // tray
  let tw = s*0.5, tb = y + s*0.70, tt = y + s*0.46
  ctx.move(to: CGPoint(x: cx-tw/2, y: tt)); ctx.addLine(to: CGPoint(x: cx-tw/2, y: tb))
  ctx.addLine(to: CGPoint(x: cx+tw/2, y: tb)); ctx.addLine(to: CGPoint(x: cx+tw/2, y: tt)); ctx.strokePath()
  // arrow
  ctx.move(to: CGPoint(x: cx, y: y+s*0.22)); ctx.addLine(to: CGPoint(x: cx, y: y+s*0.56)); ctx.strokePath()
  let hw = s*0.11
  ctx.move(to: CGPoint(x: cx-hw, y: y+s*0.44)); ctx.addLine(to: CGPoint(x: cx, y: y+s*0.56))
  ctx.addLine(to: CGPoint(x: cx+hw, y: y+s*0.44)); ctx.strokePath()
  if ring { strokeRR(ctx, x-4, y-4, s+8, s+8, s*0.24+4, BLUE, 2.5) }
}
func cursor(_ ctx: CGContext,_ x: CGFloat,_ y: CGFloat) {
  let p = CGMutablePath()
  p.move(to: CGPoint(x:x,y:y)); p.addLine(to: CGPoint(x:x,y:y+18))
  p.addLine(to: CGPoint(x:x+5,y:y+13)); p.addLine(to: CGPoint(x:x+9,y:y+21))
  p.addLine(to: CGPoint(x:x+12,y:y+19)); p.addLine(to: CGPoint(x:x+8,y:y+11))
  p.addLine(to: CGPoint(x:x+15,y:y+11)); p.closeSubpath()
  ctx.addPath(p); ctx.setFillColor(INK); ctx.fillPath()
  ctx.addPath(p); ctx.setStrokeColor(WHITE); ctx.setLineWidth(1.2); ctx.strokePath()
}
func check(_ ctx: CGContext,_ cx: CGFloat,_ cy: CGFloat,_ r: CGFloat,_ col: CGColor) {
  ctx.addPath(CGPath(ellipseIn: CGRect(x:cx-r,y:cy-r,width:2*r,height:2*r), transform:nil))
  ctx.setFillColor(col); ctx.fillPath()
  ctx.setStrokeColor(WHITE); ctx.setLineWidth(r*0.32); ctx.setLineCap(.round); ctx.setLineJoin(.round)
  ctx.move(to: CGPoint(x:cx-r*0.42,y:cy)); ctx.addLine(to: CGPoint(x:cx-r*0.08,y:cy+r*0.36))
  ctx.addLine(to: CGPoint(x:cx+r*0.45,y:cy-r*0.34)); ctx.strokePath()
}

struct S {
  var step = 1
  var edit = false, imgSel = false, txtSel = false
  var showPanel = false, dropdowns = false, sendDown = false
  var saved = false, anytype = false
  var cur: CGPoint? = nil, ring = false
  var caption = ""
}

func draw(_ st: S) -> CGImage {
  let ctx = newCtx()
  // ── Browser card ──
  let bx: CGFloat = 34, by: CGFloat = 34, bw: CGFloat = 480, bh: CGFloat = 372
  fillRR(ctx, bx, by, bw, bh, 12, PAGEBG); strokeRR(ctx, bx, by, bw, bh, 12, LINE, 1)
  fillRR(ctx, bx, by, bw, 34, 12, c(240,240,243))
  fillRR(ctx, bx, by+22, bw, 12, 0, c(240,240,243))
  for (i,col) in [c(255,95,86),c(255,189,46),c(39,201,63)].enumerated() {
    ctx.addPath(CGPath(ellipseIn: CGRect(x:bx+14+CGFloat(i)*16,y:by+13,width:9,height:9),transform:nil))
    ctx.setFillColor(col); ctx.fillPath()
  }
  fillRR(ctx, bx+74, by+9, bw-190, 17, 8, WHITE)
  text(ctx, "en.wikipedia.org", bx+84, by+21, 9.5, SUB)
  // toolbar glyph (top-right of the browser chrome)
  glyph(ctx, bx+bw-40, by+6, 22, ring: st.ring)

  // ── Page content ──
  let px = bx+22, pw = bw-44
  text(ctx, "Sample Article", px, by+70, 17, INK, bold: true)
  // image box
  let imgX = px, imgY = by+86, imgW = pw*0.52, imgH: CGFloat = 118
  fillRR(ctx, imgX, imgY, imgW, imgH, 8, c(224,228,236))
  if st.edit || st.imgSel {
    // little mountain-sun to read as an image
    ctx.setFillColor(c(196,204,216))
    ctx.addPath(CGPath(ellipseIn: CGRect(x:imgX+22,y:imgY+24,width:20,height:20),transform:nil)); ctx.fillPath()
    let m = CGMutablePath(); m.move(to: CGPoint(x:imgX+14,y:imgY+imgH-16))
    m.addLine(to: CGPoint(x:imgX+imgW*0.42,y:imgY+52)); m.addLine(to: CGPoint(x:imgX+imgW*0.7,y:imgY+imgH-16)); m.closeSubpath()
    ctx.addPath(m); ctx.setFillColor(c(176,186,200)); ctx.fillPath()
  }
  if st.imgSel { strokeRR(ctx, imgX-2, imgY-2, imgW+4, imgH+4, 9, BLUE, 3); check(ctx, imgX+imgW-6, imgY+6, 11, BLUE) }
  // text lines
  let tx = imgX+imgW+18, twd = pw-imgW-18
  let lines: [CGFloat] = [0.95, 0.8, 1.0, 0.6]
  for (i,f) in lines.enumerated() {
    let ly = imgY+8+CGFloat(i)*20
    if st.txtSel && i < 2 { fillRR(ctx, tx-4, ly-9, twd*max(f,0.85)+8, 14, 3, c(0,113,227,0.14)) }
    fillRR(ctx, tx, ly-6, twd*f, 7, 3, i<2 && st.txtSel ? c(0,113,227,0.55) : c(206,210,218))
  }
  if st.txtSel { strokeRR(ctx, tx-6, imgY+2, twd+12, 44, 6, BLUE, 2); check(ctx, tx+twd-2, imgY+4, 11, BLUE) }
  // more body lines
  for i in 0..<5 {
    fillRR(ctx, px, by+230+CGFloat(i)*17, pw*(i==4 ? 0.5 : 0.96), 6, 3, c(224,226,232))
  }
  if st.edit {
    text(ctx, "edit mode", bx+bw-96, by+bh-14, 10, BLUE, bold: true)
    strokeRR(ctx, bx+1, by+1, bw-2, bh-2, 12, c(0,113,227,0.5), 2)
  }

  // ── Right side: panel or Anytype ──
  let rx: CGFloat = 540, rw: CGFloat = 286, ry: CGFloat = 34
  if st.anytype {
    fillRR(ctx, rx, ry, rw, 372, 12, WHITE); strokeRR(ctx, rx, ry, rw, 372, 12, LINE, 1)
    text(ctx, "Anytype", rx+18, ry+30, 12, SUB, bold: true)
    text(ctx, "My Space", rx+rw-70, ry+30, 10, SUB)
    text(ctx, "🔖 Sample Article", rx+18, ry+66, 15, INK, bold: true)
    // the image, now inside Anytype
    fillRR(ctx, rx+18, ry+82, rw-36, 96, 8, c(224,228,236))
    ctx.addPath(CGPath(ellipseIn: CGRect(x:rx+40,y:ry+100,width:18,height:18),transform:nil)); ctx.setFillColor(c(196,204,216)); ctx.fillPath()
    let m = CGMutablePath(); m.move(to: CGPoint(x:rx+30,y:ry+164)); m.addLine(to: CGPoint(x:rx+rw*0.42,y:ry+112)); m.addLine(to: CGPoint(x:rx+rw*0.72,y:ry+164)); m.closeSubpath()
    ctx.addPath(m); ctx.setFillColor(c(176,186,200)); ctx.fillPath()
    for i in 0..<3 { fillRR(ctx, rx+18, ry+198+CGFloat(i)*16, (rw-36)*(i==2 ? 0.6:0.92), 6, 3, c(214,216,222)) }
    fillRR(ctx, rx+18, ry+262, rw-36, 1, 0, LINE)
    text(ctx, "🔗 Source", rx+18, ry+284, 11, BLUE)
    check(ctx, rx+rw-30, ry+300, 15, GREEN)
    text(ctx, "saved locally", rx+18, ry+306, 11, GREEN, bold: true)
  } else if st.showPanel {
    fillRR(ctx, rx, ry, rw, 372, 12, PANELBG); strokeRR(ctx, rx, ry, rw, 372, 12, LINE, 1)
    text(ctx, "Send to Anytype", rx+18, ry+28, 15, INK, bold: true)
    fillRR(ctx, rx+18, ry+42, rw-36, 1, 0, LINE)
    text(ctx, "1 image · 1 text block", rx+18, ry+64, 11.5, SUB)
    if st.dropdowns {
      text(ctx, "SPACE", rx+18, ry+92, 9.5, SUB, bold: true)
      fillRR(ctx, rx+18, ry+98, rw-36, 30, 6, WHITE); strokeRR(ctx, rx+18, ry+98, rw-36, 30, 6, LINE, 1)
      text(ctx, "My Space", rx+30, ry+118, 12, INK); text(ctx, "▾", rx+rw-34, ry+119, 12, SUB)
      text(ctx, "OBJECT TYPE", rx+18, ry+150, 9.5, SUB, bold: true)
      fillRR(ctx, rx+18, ry+156, rw-36, 30, 6, WHITE); strokeRR(ctx, rx+18, ry+156, rw-36, 30, 6, LINE, 1)
      text(ctx, "Page", rx+30, ry+176, 12, INK); text(ctx, "▾", rx+rw-34, ry+177, 12, SUB)
    }
    // Send button
    let btnY = ry+300
    fillRR(ctx, rx+18, btnY, rw-36, 40, 8, st.sendDown ? c(0,92,190) : BLUE)
    text(ctx, st.saved ? "Saved ✓" : "Send to Anytype", rx+rw/2, btnY+25, 14, WHITE, bold: true, center: true)
    if st.saved { text(ctx, "opening in Anytype…", rx+rw/2, btnY+58, 11, GREEN, center: true) }
  }

  // ── Caption bar ──
  fillRR(ctx, 34, CGFloat(H)-52, CGFloat(W)-68, 34, 8, INK)
  text(ctx, "\(st.step)", 52, CGFloat(H)-30, 13, WHITE, bold: true)
  ctx.addPath(CGPath(ellipseIn: CGRect(x:44,y:CGFloat(H)-42,width:22,height:22),transform:nil)); ctx.setStrokeColor(c(255,255,255,0.4)); ctx.setLineWidth(1.5); ctx.strokePath()
  text(ctx, st.caption, 80, CGFloat(H)-30, 13.5, WHITE, bold: true)

  if let p = st.cur { cursor(ctx, p.x, p.y) }
  return ctx.makeImage()!
}

// ── Timeline ──
var frames: [(S, Double)] = []
func add(_ s: S,_ d: Double) { frames.append((s,d)) }

// Step 1 — click the icon
var s = S(); s.step=1; s.caption="Click the Send to Anytype icon"
s.cur = CGPoint(x:300,y:230); add(s, 0.7)
s.cur = CGPoint(x:CGFloat(514-40+11), y:CGFloat(48)); add(s, 0.5)
s.ring = true; add(s, 0.9)

// Step 2 — enter edit mode + select
var e = S(); e.step=2; e.caption="Click images and text to select"; e.edit=true; e.showPanel=true
e.cur = CGPoint(x:150,y:150); add(e, 0.7)
e.imgSel=true; e.cur = CGPoint(x:150,y:150); add(e, 0.7)
e.txtSel=true; e.cur = CGPoint(x:360,y:150); add(e, 0.9)

// Step 3 — pick space + type
var d = S(); d.step=3; d.caption="Pick the Space and object type"; d.edit=true; d.imgSel=true; d.txtSel=true
d.showPanel=true; d.dropdowns=true; d.cur=CGPoint(x:700,y:150); add(d, 1.1)

// Step 4 — send
var f = d; f.step=4; f.caption="Hit Send to Anytype"; f.cur=CGPoint(x:683,y:400)
add(f, 0.6); f.sendDown=true; add(f, 0.6)

// Step 5 — saved → appears in Anytype
var g = f; g.step=5; g.caption="Saved to your local Anytype"; g.saved=true; g.sendDown=false; g.cur=nil
add(g, 0.9)
var a = S(); a.step=5; a.caption="Saved to your local Anytype"; a.anytype=true; a.edit=true; a.imgSel=true; a.txtSel=true
add(a, 1.8)

// ── Encode GIF ──
let url = URL(fileURLWithPath: outPath) as CFURL
let dest = CGImageDestinationCreateWithURL(url, "com.compuserve.gif" as CFString, frames.count, nil)!
CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
for (st, delay) in frames {
  let img = draw(st)
  CGImageDestinationAddImage(dest, img, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: delay]] as CFDictionary)
}
if CGImageDestinationFinalize(dest) { print("wrote \(frames.count) frames → \(outPath)") } else { print("FAILED") }
