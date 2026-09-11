export function exportCanvasPng(canvas: HTMLCanvasElement, fileName = 'syncan-canvas.png') {
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

export function printCanvasAsPdf() {
  window.print()
}
