import ExcelJS from 'exceljs';
import { Transaction, Account, Category } from '../types';

export const exportToExcel = async (
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  currency: string
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Coin Buddy';
  workbook.created = new Date();

  // Utility for styling headers
  const styleHeader = (worksheet: ExcelJS.Worksheet) => {
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' }, // Dark gray
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true,
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });
  };

  // Utility for styling rows (Zebra striping and borders)
  const styleRows = (worksheet: ExcelJS.Worksheet, rowCount: number, colCount: number) => {
    for (let rowIdx = 2; rowIdx <= rowCount; rowIdx++) {
      const row = worksheet.getRow(rowIdx);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= colCount) {
          if (rowIdx % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF9FAFB' }, // Light gray
            };
          }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        }
      });
    }
  };

  // Utility for auto-fitting columns
  const autoFitColumns = (worksheet: ExcelJS.Worksheet) => {
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 12 : maxLength + 2;
    });
  };

  const currencyFormat = `"${currency}" #,##0.00`;

  // --- SHEET 1: TRANSACTIONS ---
  const txSheet = workbook.addWorksheet('Transactions');
  txSheet.columns = [
    { header: 'Date', key: 'date' },
    { header: 'Title', key: 'title' },
    { header: 'Category', key: 'category' },
    { header: 'Type', key: 'type' },
    { header: 'Account', key: 'account' },
    { header: 'Status', key: 'status' },
    { header: 'Amount', key: 'amount' },
  ];

  transactions.forEach((tx) => {
    let txDate = new Date();
    try {
      if (tx.date) {
        const parsed = new Date(tx.date);
        if (!isNaN(parsed.getTime())) {
          txDate = parsed;
        }
      }
    } catch (e) {}

    txSheet.addRow({
      date: txDate,
      title: tx.title || 'Untitled',
      category: tx.category || 'General',
      type: tx.type || 'expense',
      account: tx.account || tx.fromAccountId || 'cash',
      status: tx.is_verified === 1 ? 'Completed' : 'Pending',
      amount: tx.type === 'expense' ? -Math.abs(tx.amount || 0) : Math.abs(tx.amount || 0), // or just tx.amount if it's already signed
    });
  });

  // Formatting amount column
  const amountCol = txSheet.getColumn('amount');
  amountCol.numFmt = currencyFormat;

  // Formatting date column
  const dateCol = txSheet.getColumn('date');
  dateCol.numFmt = 'yyyy-mm-dd';

  // Summary Row
  const txRowCount = txSheet.rowCount;
  const summaryRowTx = txSheet.addRow({
    date: 'Total',
    amount: { formula: `SUM(G2:G${txRowCount})` }
  });
  summaryRowTx.font = { bold: true };
  
  styleHeader(txSheet);
  styleRows(txSheet, txSheet.rowCount, 7);
  autoFitColumns(txSheet);

  // --- SHEET 2: ACCOUNT BALANCES ---
  const accSheet = workbook.addWorksheet('Account Balances');
  accSheet.columns = [
    { header: 'Account Name', key: 'name' },
    { header: 'Type', key: 'type' },
    { header: 'Balance', key: 'balance' },
  ];

  accounts.forEach((acc) => {
    accSheet.addRow({
      name: acc.name,
      type: acc.type === 'liability' ? 'Credit/Loan' : 'Asset',
      balance: acc.balance,
    });
  });

  const accAmtCol = accSheet.getColumn('balance');
  accAmtCol.numFmt = currencyFormat;

  const accRowCount = accSheet.rowCount;
  const summaryRowAcc = accSheet.addRow({
    name: 'Total Balance',
    balance: { formula: `SUM(C2:C${accRowCount})` }
  });
  summaryRowAcc.font = { bold: true };

  styleHeader(accSheet);
  styleRows(accSheet, accSheet.rowCount, 3);
  autoFitColumns(accSheet);

  // --- SHEET 3: SUMMARY ---
  const sumSheet = workbook.addWorksheet('Summary');
  sumSheet.columns = [
    { header: 'Metric', key: 'metric' },
    { header: 'Value', key: 'value' },
  ];

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  sumSheet.addRow({ metric: 'Total Income', value: totalIncome });
  sumSheet.addRow({ metric: 'Total Expenses', value: totalExpense });
  sumSheet.addRow({ metric: 'Net Worth', value: totalBalance });

  sumSheet.getColumn('value').numFmt = currencyFormat;
  
  styleHeader(sumSheet);
  styleRows(sumSheet, sumSheet.rowCount, 2);
  autoFitColumns(sumSheet);

  // Write and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coin-buddy-export-${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
