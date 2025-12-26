import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');

    const investigation: any = {
      timestamp: new Date().toISOString(),
      database: {},
      bullaware_api: {},
      github_actions: {},
      functions: {},
      recommendations: []
    };

    // 1. Check database state
    const { count: traderCount, error: traderCountError } = await supabase
      .from('traders')
      .select('*', { count: 'exact', head: true });

    const { count: pendingJobs, error: pendingError } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: completedJobs, error: completedError } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    const { data: recentTraders, error: recentError } = await supabase
      .from('traders')
      .select('id, etoro_username, updated_at, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    investigation.database = {
      total_traders: traderCount || 0,
      pending_jobs: pendingJobs || 0,
      completed_jobs: completedJobs || 0,
      recent_traders: recentTraders || [],
      errors: {
        trader_count: traderCountError?.message,
        pending_jobs: pendingError?.message,
        completed_jobs: completedError?.message,
        recent_traders: recentError?.message
      }
    };

    // 2. Test Bullaware API directly - test multiple pages to see total available
    if (BULLAWARE_API_KEY) {
      try {
        // Test first page
        const testUrl1 = 'https://api.bullaware.com/v1/investors?limit=1000&offset=0';
        const testResponse1 = await fetch(testUrl1, {
          headers: {
            'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000)
        });

        if (testResponse1.ok) {
          const testData1 = await testResponse1.json();
          const testTraders1 = testData1.items || testData1.data || testData1.investors || testData1.results || (Array.isArray(testData1) ? testData1 : []);
          
          investigation.bullaware_api = {
            status: 'working',
            test_response_status: testResponse1.status,
            page_1_traders_returned: testTraders1.length,
            response_structure: Object.keys(testData1),
            sample_trader: testTraders1[0] || null
          };

          // Try to get total count if available
          if (testData1.total !== undefined) {
            investigation.bullaware_api.total_available = testData1.total;
          } else if (testData1.count !== undefined) {
            investigation.bullaware_api.total_available = testData1.count;
          }

          // Test second page to see if pagination works
          if (testTraders1.length === 1000) {
            await new Promise(resolve => setTimeout(resolve, 6000)); // Respect rate limit
            const testUrl2 = 'https://api.bullaware.com/v1/investors?limit=1000&offset=1000';
            const testResponse2 = await fetch(testUrl2, {
              headers: {
                'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              signal: AbortSignal.timeout(10000)
            });

            if (testResponse2.ok) {
              const testData2 = await testResponse2.json();
              const testTraders2 = testData2.items || testData2.data || testData2.investors || testData2.results || (Array.isArray(testData2) ? testData2 : []);
              investigation.bullaware_api.page_2_traders_returned = testTraders2.length;
              investigation.bullaware_api.pagination_works = testTraders2.length > 0;
              
              if (testTraders2.length === 0) {
                investigation.bullaware_api.note = 'Pagination may have reached end, or API only returns first 1000 traders';
              }
            } else {
              investigation.bullaware_api.page_2_error = testResponse2.status;
            }
          } else {
            investigation.bullaware_api.note = `First page returned ${testTraders1.length} traders (less than 1000), may be all available traders`;
          }
        } else {
          investigation.bullaware_api = {
            status: 'error',
            error_status: testResponse1.status,
            error_text: await testResponse1.text().catch(() => 'Unable to read error')
          };
        }
      } catch (e: any) {
        investigation.bullaware_api = {
          status: 'error',
          error: e.message || e.toString()
        };
      }
    } else {
      investigation.bullaware_api = {
        status: 'error',
        error: 'BULLAWARE_API_KEY not configured'
      };
    }

    // 3. Check if functions are deployed (test invoke)
    const functionsToTest = ['sync-traders', 'enqueue-sync-jobs', 'dispatch-sync-jobs', 'process-sync-job'];
    investigation.functions = {};
    
    for (const funcName of functionsToTest) {
      try {
        const { data, error } = await supabase.functions.invoke(funcName, {
          body: funcName === 'sync-traders' ? {} : (funcName === 'enqueue-sync-jobs' ? {} : (funcName === 'process-sync-job' ? { job_id: 'test' } : {}))
        });
        
        investigation.functions[funcName] = {
          deployed: !error || (error && !error.message?.includes('not found')),
          error: error ? (typeof error === 'string' ? error : error.message) : null
        };
      } catch (e: any) {
        investigation.functions[funcName] = {
          deployed: false,
          error: e.message || e.toString()
        };
      }
    }

    // 4. Generate recommendations
    if ((traderCount || 0) < 1000) {
      investigation.recommendations.push({
        severity: 'high',
        issue: `Only ${traderCount} traders in database, expected 1000+`,
        possible_causes: [
          'sync-traders not fetching all available traders from Bullaware',
          'discover-traders workflow not running',
          'Bullaware API only returns limited traders',
          'Database constraint preventing inserts'
        ],
        actions: [
          'Check GitHub Actions: https://github.com/michaelwu1407-droid/market-compass-77/actions',
          'Manually trigger discover-traders workflow',
          'Check Bullaware API response in investigation.bullaware_api',
          'Check Supabase logs for sync-traders errors'
        ]
      });
    }

    if ((pendingJobs || 0) === 0 && (traderCount || 0) > 0) {
      investigation.recommendations.push({
        severity: 'medium',
        issue: 'No pending jobs but traders exist',
        possible_causes: [
          'enqueue-sync-jobs not being called',
          'All jobs already processed',
          'Jobs failing to create'
        ],
        actions: [
          'Manually call enqueue-sync-jobs with {}',
          'Check sync-worker workflow is running'
        ]
      });
    }

    if (!BULLAWARE_API_KEY) {
      investigation.recommendations.push({
        severity: 'critical',
        issue: 'BULLAWARE_API_KEY not configured',
        actions: [
          'Set BULLAWARE_API_KEY in Supabase Edge Function secrets'
        ]
      });
    }

    if (investigation.bullaware_api.status === 'error') {
      investigation.recommendations.push({
        severity: 'critical',
        issue: 'Bullaware API test failed',
        details: investigation.bullaware_api,
        actions: [
          'Check BULLAWARE_API_KEY is valid',
          'Check Bullaware API status',
          'Review API error details above'
        ]
      });
    }

    return new Response(JSON.stringify(investigation, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      error: error?.message || error?.toString() || 'Unknown error',
      stack: error?.stack
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

