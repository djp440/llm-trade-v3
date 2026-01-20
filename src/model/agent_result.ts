
export interface BullAnalysisResult {
    bull_confidence: number;
    reason: string;
    stop_loss: number | null;
    scenario_prediction: string;
}

export interface BearAnalysisResult {
    bear_confidence: number;
    reason: string;
    stop_loss: number | null;
    scenario_prediction: string;
}
