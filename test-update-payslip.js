require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
    const { data: payslips, error: fetchErr } = await supabase.from('payslips').select('*').limit(1);
    if (fetchErr || !payslips.length) {
        console.log('No payslips found or fetch error', fetchErr);
        return;
    }
    
    const p = payslips[0];
    console.log('Original Payslip:', p);
    
    const { data: updateData, error: updateErr } = await supabase
        .from('payslips')
        .update({ other_adjustment: p.other_adjustment + 100 })
        .eq('id', p.id)
        .select();
        
    if (updateErr) {
        console.error('Update Error:', updateErr);
    } else {
        console.log('Updated Payslip:', updateData);
    }
}
test();
