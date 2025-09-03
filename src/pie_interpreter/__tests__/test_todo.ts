import 'jest'
import { evaluatePie } from '../main'

describe('evaluatePie', () => {
  it('test0', () => {
    const result = evaluatePie(
      `
      (claim peas TODO)
      `
    );
    console.log(result)
  });

  it('test1', () => {
    const result = evaluatePie(
      `
(claim peas
(Pi ((n Nat))
TODO))
      `
    );
    console.log(result)
  });

  it('test2', () => {
    const result = evaluatePie(
      `
(claim peas
(Pi ((n Nat))
(Vec Atom n)))
(define peas
TODO)
      `
    );
    console.log(result)
  });
})
