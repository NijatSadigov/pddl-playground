import { describe, it, expect } from 'vitest';
import {
  parseDomain,
  parseProblem,
  parsePlanStep,
  atomKey,
  atomStr,
} from './parser';
import { simulate } from './simulate';
import { compileNegativePreconditions } from './compileNegatives';
import { validatePddl } from './validate';
import { looksEpistemic } from '../data/examples';

// --- parser -------------------------------------------------------------------

describe('parser', () => {
  const DOMAIN = `(define (domain d)
    (:requirements :strips :typing)
    (:types thing)
    (:predicates (at ?x - thing ?l - thing) (clear ?l - thing))
    (:action move
      :parameters (?x - thing ?from - thing ?to - thing)
      :precondition (and (at ?x ?from) (clear ?to))
      :effect (and (not (at ?x ?from)) (at ?x ?to))))`;

  it('extracts action parameters and add/delete effects', () => {
    const d = parseDomain(DOMAIN);
    const move = d.actions.get('move')!;
    expect(move.params).toEqual(['?x', '?from', '?to']);
    expect(move.add.map(atomStr)).toContain('(at ?x ?to)');
    expect(move.del.map(atomStr)).toContain('(at ?x ?from)');
  });

  it('parses problem init, objects and goal', () => {
    const p = parseProblem(`(define (problem p) (:domain d)
      (:objects a b - thing)
      (:init (at a b) (clear a))
      (:goal (and (at a a))))`);
    expect(p.objects).toEqual([
      { name: 'a', type: 'thing' },
      { name: 'b', type: 'thing' },
    ]);
    expect(p.init.map(atomKey)).toContain('at|a|b');
    expect(p.goal.map(atomKey)).toEqual(['at|a|a']);
  });

  it('parses a plan step into name + args (lower-cased)', () => {
    expect(parsePlanStep('(Move R1 loc-0-0 loc-0-1)')).toEqual([
      'move',
      'r1',
      'loc-0-0',
      'loc-0-1',
    ]);
  });
});

// --- simulator ----------------------------------------------------------------

describe('simulate', () => {
  const DOMAIN = `(define (domain toggle)
    (:requirements :strips)
    (:predicates (on) (off))
    (:action turn-on :parameters ()
      :precondition (off) :effect (and (on) (not (off)))))`;
  const PROBLEM = `(define (problem t) (:domain toggle)
    (:objects) (:init (off)) (:goal (on)))`;

  it('applies effects, records the diff, and detects the goal', () => {
    const sim = simulate(parseDomain(DOMAIN), parseProblem(PROBLEM), [
      '(turn-on)',
    ]);
    expect(sim.steps).toHaveLength(1);
    const step = sim.steps[0];
    expect(step.added.map(atomKey)).toEqual(['on']);
    expect(step.deleted.map(atomKey)).toEqual(['off']);
    expect(step.state.map(atomKey)).toEqual(['on']);
    expect(step.goalMet).toBe(true);
  });
});

// --- negative-precondition compiler -------------------------------------------

// The ORIGINAL dissertation domain, using :negative-preconditions verbatim.
const NEG_DOMAIN = `(define (domain minefield)
  (:requirements :strips :typing :negative-preconditions)
  (:types robot gold location - object)
  (:predicates
    (at ?r - robot ?l - location)
    (gold-at ?g - gold ?l - location)
    (obstacle-at ?l - location)
    (adjacent ?l1 - location ?l2 - location)
    (collected ?g - gold))
  (:action move
    :parameters (?r - robot ?from - location ?to - location)
    :precondition (and (at ?r ?from) (adjacent ?from ?to) (not (obstacle-at ?to)))
    :effect (and (not (at ?r ?from)) (at ?r ?to)))
  (:action collect
    :parameters (?r - robot ?g - gold ?l - location)
    :precondition (and (at ?r ?l) (gold-at ?g ?l) (not (collected ?g)))
    :effect (and (collected ?g))))`;

// 2x2 grid, one obstacle (loc-1-0), one gold (g1), nothing collected yet.
const NEG_PROBLEM = `(define (problem mf) (:domain minefield)
  (:objects r1 - robot g1 - gold
    loc-0-0 loc-0-1 loc-1-0 loc-1-1 - location)
  (:init
    (at r1 loc-0-0) (gold-at g1 loc-1-1) (obstacle-at loc-1-0))
  (:goal (collected g1)))`;

describe('looksEpistemic', () => {
  it('flags epistemic (E-PDDL) domains', () => {
    expect(
      looksEpistemic('(define (domain d) (:requirements :mep) (:agents a b))'),
    ).toBe(true);
  });
  it('does not flag classical domains', () => {
    expect(
      looksEpistemic('(define (domain d) (:requirements :strips :typing))'),
    ).toBe(false);
  });
});

describe('validatePddl', () => {
  it('accepts well-formed PDDL', () => {
    expect(
      validatePddl('(define (domain d) (:predicates (p)))', 'domain'),
    ).toBeNull();
    expect(
      validatePddl('(define (problem p) (:goal (g)))', 'problem'),
    ).toBeNull();
  });

  it('reports unclosed parentheses', () => {
    expect(validatePddl('(define (domain d) (:predicates (p))', 'domain')).toMatch(
      /unclosed/,
    );
  });

  it('reports an unexpected close paren with a line number', () => {
    const msg = validatePddl('(define\n(domain d)))', 'domain');
    expect(msg).toMatch(/line 2/);
  });

  it('reports a missing header', () => {
    expect(validatePddl('(foo (bar))', 'domain')).toMatch(/define \(domain/);
  });

  it('ignores parentheses inside comments', () => {
    expect(
      validatePddl('(define (domain d)) ; a stray ) in a comment', 'domain'),
    ).toBeNull();
  });
});

describe('compileNegativePreconditions', () => {
  it('is a no-op when there are no negative preconditions', () => {
    const positive = `(define (domain d) (:requirements :strips)
      (:predicates (p)) (:action a :parameters () :precondition (p) :effect (p)))`;
    const res = compileNegativePreconditions(positive, NEG_PROBLEM);
    expect(res.changed).toBe(false);
  });

  it('detects the negated predicates', () => {
    const res = compileNegativePreconditions(NEG_DOMAIN, NEG_PROBLEM);
    expect(res.changed).toBe(true);
    expect(res.negated.sort()).toEqual(['collected', 'obstacle-at']);
  });

  it('removes negative preconditions and adds complement predicates', () => {
    const { domain } = compileNegativePreconditions(NEG_DOMAIN, NEG_PROBLEM);
    // no negated predicate remains inside a precondition
    expect(domain).not.toMatch(/\(not\s+\(obstacle-at/);
    expect(domain).not.toMatch(/\(not\s+\(collected/);
    // complement predicates are declared and used positively
    expect(domain).toContain('not-obstacle-at');
    expect(domain).toContain('not-collected');
  });

  it('mirrors complements in effects (collect maintains not-collected)', () => {
    const { domain } = compileNegativePreconditions(NEG_DOMAIN, NEG_PROBLEM);
    // adding (collected ?g) must also clear (not-collected ?g)
    expect(domain.replace(/\s+/g, ' ')).toContain('(not (not-collected ?g))');
  });

  it('adds closed-world init facts for the complement predicates', () => {
    const res = compileNegativePreconditions(NEG_DOMAIN, NEG_PROBLEM);
    // not-obstacle-at: 4 locations - 1 obstacle = 3
    // not-collected:   1 gold - 0 collected   = 1
    expect(res.addedFacts).toBe(4);
    expect(res.problem).toContain('not-obstacle-at loc-0-0');
    expect(res.problem).not.toContain('not-obstacle-at loc-1-0'); // the obstacle
    expect(res.problem).toContain('not-collected g1');
  });

  it('produces a plan-equivalent domain that parses cleanly', () => {
    const { domain, problem } = compileNegativePreconditions(
      NEG_DOMAIN,
      NEG_PROBLEM,
    );
    const d = parseDomain(domain);
    const p = parseProblem(problem);
    expect(d.actions.has('move')).toBe(true);
    expect(d.actions.has('collect')).toBe(true);
    // simulating the known optimal plan on the compiled sources reaches the goal
    const plan = [
      '(move r1 loc-0-0 loc-0-1)',
      '(move r1 loc-0-1 loc-1-1)',
      '(collect r1 g1 loc-1-1)',
    ];
    const sim = simulate(d, p, plan);
    expect(sim.steps.at(-1)!.goalMet).toBe(true);
  });
});
