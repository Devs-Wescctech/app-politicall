let pdfMakePromise: Promise<any> | null = null;

async function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]).then(([pdfMakeModule, pdfFonts]) => {
      const pdfMake = (pdfMakeModule as any).default ?? pdfMakeModule;
      const fonts = (pdfFonts as any).pdfMake?.vfs ?? (pdfFonts as any).vfs ?? pdfFonts;
      pdfMake.vfs = fonts;
      return pdfMake;
    });
  }

  return pdfMakePromise;
}

export async function downloadPdf(docDefinition: any, filename: string): Promise<void> {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(docDefinition).download(filename);
}
