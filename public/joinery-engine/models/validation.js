const TOLERANCE_MM = 1;
export function validateJoineryConfig(config) {
    const errors = [];
    const warnings = [];
    if (!Number.isFinite(config.width) || config.width <= 0)
        errors.push('A largura total deve ser superior a 0 mm.');
    if (!Number.isFinite(config.height) || config.height <= 0)
        errors.push('A altura total deve ser superior a 0 mm.');
    if (!config.layout?.cols?.length)
        errors.push('A configuração precisa de pelo menos um módulo vertical.');
    if (!config.layout?.rows?.length)
        errors.push('A configuração precisa de pelo menos uma divisão horizontal.');
    if (config.layout?.cols?.some((value) => !Number.isFinite(value) || value <= 0))
        errors.push('Todas as larguras dos módulos devem ser positivas.');
    if (config.layout?.rows?.some((value) => !Number.isFinite(value) || value <= 0))
        errors.push('Todas as alturas das divisões devem ser positivas.');
    const colsTotal = (config.layout?.cols ?? []).reduce((sum, value) => sum + value, 0);
    const rowsTotal = (config.layout?.rows ?? []).reduce((sum, value) => sum + value, 0);
    if (config.width > 0 && Math.abs(colsTotal - config.width) > TOLERANCE_MM) {
        errors.push(`A soma das larguras dos módulos (${colsTotal} mm) deve ser igual à largura total (${config.width} mm).`);
    }
    if (config.height > 0 && Math.abs(rowsTotal - config.height) > TOLERANCE_MM) {
        errors.push(`A soma das alturas (${rowsTotal} mm) deve ser igual à altura total (${config.height} mm).`);
    }
    const occupied = new Set();
    for (const cell of config.cells ?? []) {
        const rowSpan = cell.rowSpan ?? 1;
        const colSpan = cell.colSpan ?? 1;
        if (cell.row < 0 || cell.col < 0 || cell.row + rowSpan > (config.layout?.rows?.length ?? 0) || cell.col + colSpan > (config.layout?.cols?.length ?? 0)) {
            errors.push(`O módulo ${cell.id ?? `${cell.row}:${cell.col}`} está fora da grelha.`);
            continue;
        }
        for (let row = cell.row; row < cell.row + rowSpan; row += 1) {
            for (let col = cell.col; col < cell.col + colSpan; col += 1) {
                const key = `${row}:${col}`;
                if (occupied.has(key))
                    errors.push(`Existem módulos sobrepostos na posição ${key}.`);
                occupied.add(key);
            }
        }
    }
    if (!config.system)
        warnings.push('Série/sistema de alumínio ainda não definido.');
    if (!config.glassDescription)
        warnings.push('Composição do vidro ainda não definida.');
    return { valid: errors.length === 0, errors, warnings };
}
