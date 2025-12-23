-- Fix trades pointing to numeric-symbol assets by consolidating them with existing correct assets

DO $$
DECLARE
  numeric_asset RECORD;
  correct_asset_id UUID;
BEGIN
  FOR numeric_asset IN 
    SELECT id, symbol FROM public.assets WHERE symbol ~ '^[0-9]+$'
  LOOP
    correct_asset_id := NULL;
    
    CASE numeric_asset.symbol
      WHEN '4321' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'UBER' LIMIT 1;
      WHEN '3357' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'SHOP' LIMIT 1;
      WHEN '4399' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'ABNB' LIMIT 1;
      WHEN '3027' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'DOCU' LIMIT 1;
      WHEN '4407' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'PINS' LIMIT 1;
      WHEN '4446' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'SNAP' LIMIT 1;
      WHEN '100000' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'SPX500' LIMIT 1;
      WHEN '100001' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'NSDQ100' LIMIT 1;
      WHEN '1430' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'USDJPY' LIMIT 1;
      WHEN '27' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'NATGAS' LIMIT 1;
      WHEN '32' THEN SELECT id INTO correct_asset_id FROM public.assets WHERE symbol = 'OIL' LIMIT 1;
      ELSE NULL;
    END CASE;
    
    IF correct_asset_id IS NOT NULL THEN
      UPDATE public.trades SET asset_id = correct_asset_id WHERE asset_id = numeric_asset.id;
      UPDATE public.trader_holdings SET asset_id = correct_asset_id WHERE asset_id = numeric_asset.id;
      DELETE FROM public.assets WHERE id = numeric_asset.id;
    END IF;
  END LOOP;
END $$;

-- Update remaining numeric assets that don't have duplicates (LCID doesn't exist yet)
UPDATE public.assets SET symbol = 'LCID', name = 'Lucid Group Inc.', asset_type = 'stock' WHERE symbol = '4465';

-- Create analysis_templates table
CREATE TABLE IF NOT EXISTS public.analysis_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own templates" ON public.analysis_templates FOR SELECT USING (auth.uid() = user_id OR is_default = true);
CREATE POLICY "Users can create their own templates" ON public.analysis_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own templates" ON public.analysis_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.analysis_templates FOR DELETE USING (auth.uid() = user_id);

-- Create report_qa_messages table
CREATE TABLE IF NOT EXISTS public.report_qa_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.report_qa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Q&A messages" ON public.report_qa_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own Q&A messages" ON public.report_qa_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Insert default templates
INSERT INTO public.analysis_templates (user_id, name, description, sections, is_default)
SELECT NULL, 'Standard Investment Report', 'Comprehensive analysis with all key sections', 
'[{"name": "Executive Summary", "prompt": "Provide a 2-3 sentence executive summary"}, {"name": "Investment Thesis", "prompt": "Explain the core investment thesis"}, {"name": "Key Metrics", "prompt": "List the most important financial metrics"}, {"name": "Bull Case", "prompt": "Describe the bullish scenario"}, {"name": "Bear Case", "prompt": "Describe the bearish scenario"}, {"name": "Risk Factors", "prompt": "List key risk factors"}, {"name": "Recommendation", "prompt": "Provide a clear recommendation with target price"}]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.analysis_templates WHERE name = 'Standard Investment Report');

INSERT INTO public.analysis_templates (user_id, name, description, sections, is_default)
SELECT NULL, 'Quick Summary', 'Brief analysis for rapid decision-making',
'[{"name": "Summary", "prompt": "One paragraph summary of the opportunity"}, {"name": "Key Takeaway", "prompt": "Single most important insight"}, {"name": "Action", "prompt": "Recommended action"}]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.analysis_templates WHERE name = 'Quick Summary');

INSERT INTO public.analysis_templates (user_id, name, description, sections, is_default)
SELECT NULL, 'Trader Portfolio Review', 'Analysis focused on copy trading',
'[{"name": "Strategy Overview", "prompt": "Describe the trader strategy"}, {"name": "Risk Profile", "prompt": "Assess risk characteristics"}, {"name": "Portfolio Composition", "prompt": "Analyze current holdings"}, {"name": "Performance Analysis", "prompt": "Review historical performance"}, {"name": "Suitability", "prompt": "Who should copy this trader"}]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.analysis_templates WHERE name = 'Trader Portfolio Review');