"""Numerical and pairing checks; run with unittest and the project virtual environment."""
import importlib.util
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from scipy.integrate import quad

SCRIPT = Path(__file__).with_name('paired-correctness-test.py')
spec = importlib.util.spec_from_file_location('paired_correctness', SCRIPT)
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class PairedCorrectnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runs, _ = analysis.load_runs(analysis.ROOT)
        cls.ids = set(cls.runs['nova-lite', 1])
        cls.rows = analysis.paired_rows(cls.runs, cls.ids)

    def test_saved_data_and_pairing(self):
        self.assertEqual(len(self.rows), 160)
        result = analysis.paired_test(self.rows)
        self.assertEqual(result['df'], 159)
        self.assertAlmostEqual(result['mean_difference_pp'], 13.125)
        self.assertEqual(result['difference_distribution'],
                         {-1: 5, -.5: 1, 0: 122, .5: 11, 1: 21})
        for r, totals in ((1, (127, 146)), (2, (124, 147))):
            self.assertEqual(tuple(sum(self.runs[m, r].values()) for m in analysis.MODELS), totals)

    def test_question_ids_not_input_order_determine_pairs(self):
        reversed_runs = {key: dict(reversed(list(scores.items())))
                         for key, scores in self.runs.items()}
        self.assertEqual(analysis.paired_rows(reversed_runs, self.ids), self.rows)

    def test_both_repetitions_stay_in_one_question(self):
        runs = {('nova-lite', 1): {'Q': 0}, ('nova-lite', 2): {'Q': 1},
                ('haiku-4-5', 1): {'Q': 1}, ('haiku-4-5', 2): {'Q': 1}}
        rows = analysis.paired_rows(runs, {'Q'})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['difference'], .5)

    def test_t_probability_against_numerical_density_integral(self):
        result = analysis.paired_test(self.rows)
        df = result['df']
        coefficient = math.exp(math.lgamma((df+1)/2) - math.lgamma(df/2)) / math.sqrt(df*math.pi)
        def density(x):
            return coefficient * (1+x*x/df)**(-(df+1)/2)
        probability = 2 * quad(density, abs(result['t_statistic']), math.inf)[0]
        self.assertAlmostEqual(probability, result['p_two_sided'], places=11)

    def test_swapping_models_reverses_effect_not_two_sided_p(self):
        reversed_rows = [{**row, 'nova_mean': row['haiku_mean'],
                          'haiku_mean': row['nova_mean']} for row in self.rows]
        original = analysis.paired_test(self.rows)
        reversed_result = analysis.paired_test(reversed_rows)
        self.assertAlmostEqual(original['t_statistic'], -reversed_result['t_statistic'])
        self.assertAlmostEqual(original['p_two_sided'], reversed_result['p_two_sided'])
        self.assertAlmostEqual(original['confidence_interval_95_pp'][0],
                               -reversed_result['confidence_interval_95_pp'][1])

    def test_uncertain_attempt_is_rejected_even_with_complete_flags(self):
        target = analysis.ROOT / 'src/experiments/runs/nova-lite/repetition-1/evaluation/results.json'
        read_bytes = Path.read_bytes
        changed = json.loads(read_bytes(target))
        trajectory = next(
            e for e in changed['episodes'] if e['questionId'] == 'CB200-E001'
        )['trajectoryResults'][0]
        # Exercise the attempt-level guard independently of the completeness flags.
        trajectory['attemptEvaluations'][0]['outcome'] = 'evaluator_uncertain'

        def fake_read(path):
            return json.dumps(changed).encode() if path == target else read_bytes(path)

        with patch.object(Path, 'read_bytes', fake_read):
            with self.assertRaisesRegex(ValueError, 'Uncertain attempt: CB200-E001'):
                analysis.load_runs(analysis.ROOT)

    def test_duplicate_or_missing_question_is_rejected(self):
        target = analysis.ROOT / 'src/experiments/runs/nova-lite/repetition-1/evaluation/results.json'
        read_bytes = Path.read_bytes
        original = json.loads(read_bytes(target))
        for duplicate in (False, True):
            changed = {**original, 'episodes': list(original['episodes'])}
            if duplicate:
                changed['episodes'].append(changed['episodes'][0])
            else:
                changed['episodes'].pop(0)
            def fake_read(path):
                return json.dumps(changed).encode() if path == target else read_bytes(path)
            with self.subTest(duplicate=duplicate), patch.object(Path, 'read_bytes', fake_read):
                with self.assertRaisesRegex(ValueError, 'Duplicate|Missing'):
                    analysis.load_runs(analysis.ROOT)


if __name__ == '__main__':
    unittest.main()
