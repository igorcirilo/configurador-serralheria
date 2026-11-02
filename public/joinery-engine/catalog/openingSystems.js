export const OPENING_SYSTEM_CATALOG = [
    {
        id: 'fixed', label: 'Fixo', family: 'fixed', status: 'validated', availableInConfigurator: true,
        leaves: 0, engineTypes: ['fixed'], movement: 'none', requiresHand: false, requiresDirection: false, requiresActiveLeaf: false,
        geometryRule: 'Aro, enchimento e divisões; não cria folha móvel.',
        technicalConvention: 'Sem linhas de movimento.'
    },
    {
        id: 'casement_1', label: 'Abrir 1 folha', family: 'hinged', status: 'validated', availableInConfigurator: true,
        leaves: 1, engineTypes: ['casement_left', 'casement_right'], movement: 'rotation', requiresHand: true, requiresDirection: true, requiresActiveLeaf: false,
        geometryRule: 'Uma folha independente, com dobradiças num lado e puxador no lado oposto.',
        technicalConvention: 'Os cantos do lado das dobradiças convergem no ponto médio do lado oposto.'
    },
    {
        id: 'tilt_turn', label: 'Oscilo-batente', family: 'hinged', status: 'validated', availableInConfigurator: true,
        leaves: 1, engineTypes: ['tilt_turn_left', 'tilt_turn_right'], movement: 'rotation+tilt', requiresHand: true, requiresDirection: true, requiresActiveLeaf: false,
        geometryRule: 'Uma folha com rotação lateral e tombar superior combinados.',
        technicalConvention: 'Sobreposição do triângulo de batente com o V que liga os cantos superiores ao centro inferior.'
    },
    {
        id: 'casement_2', label: 'Abrir 2 folhas', family: 'hinged', status: 'review', availableInConfigurator: true,
        leaves: 2, engineTypes: ['double_casement'], movement: 'paired-rotation', requiresHand: false, requiresDirection: true, requiresActiveLeaf: true,
        geometryRule: 'Duas folhas com encontro central e definição de folha ativa.',
        technicalConvention: 'Dois símbolos de batente espelhados; encontro central pendente de validação por sistema.'
    },
    {
        id: 'sliding_2', label: 'Correr 2 folhas', family: 'sliding', status: 'review', availableInConfigurator: true,
        leaves: 2, engineTypes: ['sliding_2'], movement: 'opposed-sliding', requiresHand: false, requiresDirection: false, requiresActiveLeaf: true,
        geometryRule: 'Duas folhas em calhas distintas, com sobreposição e deslocações opostas.',
        technicalConvention: 'Setas de deslocamento ainda não validadas por fabricante.'
    },
    {
        id: 'sliding_3', label: 'Correr 3 folhas', family: 'sliding', status: 'review', availableInConfigurator: true,
        leaves: 3, engineTypes: ['sliding_3'], movement: 'multi-track-sliding', requiresHand: false, requiresDirection: false, requiresActiveLeaf: true,
        geometryRule: 'Três folhas distribuídas por calhas conforme o sistema selecionado.',
        technicalConvention: 'Calhas, sobreposição e recolha pendentes de referência técnica.'
    },
    {
        id: 'sliding_4', label: 'Correr 4 folhas', family: 'sliding', status: 'review', availableInConfigurator: true,
        leaves: 4, engineTypes: ['sliding_4'], movement: 'paired-multi-track-sliding', requiresHand: false, requiresDirection: false, requiresActiveLeaf: true,
        geometryRule: 'Quatro folhas em dois pares, com sobreposição e recolha para os lados.',
        technicalConvention: 'Deslocamentos esquemáticos; número de calhas e encontros dependem do sistema do fabricante.'
    },
    {
        id: 'hopper', label: 'Basculante / Tombar', family: 'projected', status: 'review', availableInConfigurator: true,
        leaves: 1, engineTypes: ['hopper'], movement: 'bottom-hinged-tilt', requiresHand: false, requiresDirection: true, requiresActiveLeaf: false,
        geometryRule: 'Folha com eixo horizontal inferior.',
        technicalConvention: 'V dos cantos superiores ao centro inferior; sentido mecânico por validar.'
    },
    {
        id: 'awning', label: 'Projetante', family: 'projected', status: 'planned', availableInConfigurator: false,
        leaves: 1, engineTypes: ['awning'], movement: 'top-hinged-projection', requiresHand: false, requiresDirection: true, requiresActiveLeaf: false,
        geometryRule: 'Folha com eixo horizontal superior e projeção para fora.',
        technicalConvention: 'Convenção pendente de catálogo técnico.'
    },
    {
        id: 'pivot', label: 'Pivotante', family: 'pivoting', status: 'planned', availableInConfigurator: false,
        leaves: 1, engineTypes: ['pivot_vertical'], movement: 'axis-rotation', requiresHand: false, requiresDirection: true, requiresActiveLeaf: false,
        geometryRule: 'Folha roda em torno de um eixo configurável.',
        technicalConvention: 'Posição do eixo e símbolo pendentes de validação.'
    },
    {
        id: 'folding', label: 'Harmónio', family: 'folding', status: 'planned', availableInConfigurator: false,
        leaves: 0, engineTypes: [], movement: 'linked-folding', requiresHand: true, requiresDirection: true, requiresActiveLeaf: true,
        geometryRule: 'Conjunto de folhas articuladas com lado e sequência de recolha.',
        technicalConvention: 'Não implementado até existir documentação mecânica do sistema.'
    }
];
export function getOpeningSystem(id) {
    return OPENING_SYSTEM_CATALOG.find((system) => system.id === id);
}
export function listOpeningSystems(status) {
    return status ? OPENING_SYSTEM_CATALOG.filter((system) => system.status === status) : [...OPENING_SYSTEM_CATALOG];
}
