# Envia bytes "RAW" (ESC/POS) directo a una impresora instalada en Windows,
# saltandose el controlador grafico. Usa la cola de impresion (winspool.drv).
#
# Uso:   powershell -File raw-print.ps1 -Printer "NOMBRE" -File "C:\ruta\ticket.bin"
#
# Codigos de salida (el agente los traduce a mensajes):
#   0 = enviado       2 = no se pudo abrir la impresora   3 = no se pudo iniciar el trabajo
#   4 = archivo no existe o vacio   5 = la impresora no recibio todos los datos   1 = otro error
#
# Nota: el texto de este archivo es ASCII a proposito (PowerShell 5.1 lee los .ps1 sin BOM como ANSI).
param(
    [Parameter(Mandatory = $true)][string]$Printer,
    [Parameter(Mandatory = $true)][string]$File
)

$ErrorActionPreference = 'Stop'

function Fail([int]$code, [string]$message) {
    [Console]::Error.WriteLine($message)
    exit $code
}

if (-not (Test-Path -LiteralPath $File)) { Fail 4 "No existe el archivo a imprimir." }

if (-not ('MpRawPrinter' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class MpRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern bool OpenPrinter(string printerName, out IntPtr hPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    // Devuelve 0 si todo salio bien; si no, el codigo descrito arriba. winErr = ultimo error de Windows.
    public static int Send(string printerName, byte[] data, string docName, out int winErr)
    {
        winErr = 0;
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            winErr = Marshal.GetLastWin32Error();
            return 2;
        }

        int result = 0;
        bool docStarted = false;
        bool pageStarted = false;
        IntPtr unmanaged = IntPtr.Zero;
        try
        {
            DOCINFO di = new DOCINFO();
            di.pDocName = docName;
            di.pOutputFile = null;
            di.pDataType = "RAW";

            if (StartDocPrinter(hPrinter, 1, di) == 0)
            {
                winErr = Marshal.GetLastWin32Error();
                return 3;
            }
            docStarted = true;

            if (!StartPagePrinter(hPrinter))
            {
                winErr = Marshal.GetLastWin32Error();
                return 3;
            }
            pageStarted = true;

            unmanaged = Marshal.AllocCoTaskMem(data.Length);
            Marshal.Copy(data, 0, unmanaged, data.Length);

            int written;
            if (!WritePrinter(hPrinter, unmanaged, data.Length, out written) || written != data.Length)
            {
                winErr = Marshal.GetLastWin32Error();
                result = 5;
            }
        }
        finally
        {
            if (unmanaged != IntPtr.Zero) Marshal.FreeCoTaskMem(unmanaged);
            if (pageStarted) EndPagePrinter(hPrinter);
            if (docStarted) EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
        }
        return result;
    }
}
"@
}

try {
    $bytes = [System.IO.File]::ReadAllBytes($File)
    if ($bytes.Length -eq 0) { Fail 4 "El ticket esta vacio." }

    $winErr = 0
    $rc = [MpRawPrinter]::Send($Printer, $bytes, 'MotoPartes ticket', [ref]$winErr)

    switch ($rc) {
        0 { exit 0 }
        2 {
            if ($winErr -eq 1801) { Fail 2 ("No existe una impresora llamada '" + $Printer + "' en Windows. Revisa el nombre en config.json.") }
            Fail 2 ("No se pudo abrir la impresora '" + $Printer + "' (error de Windows " + $winErr + "). Revisa que este encendida y conectada.")
        }
        3 { Fail 3 ("Windows no pudo iniciar el trabajo de impresion (error " + $winErr + "). Revisa que la impresora este lista.") }
        5 { Fail 5 ("La impresora no recibio todos los datos (error " + $winErr + "). Revisa papel, tapa y que este encendida.") }
        default { Fail 1 ("Error al imprimir (codigo " + $rc + ").") }
    }
}
catch {
    Fail 1 ("Error al imprimir: " + $_.Exception.Message)
}
