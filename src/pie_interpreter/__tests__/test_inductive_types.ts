import 'jest';

import { evaluatePie } from '../main'

describe("Bool_datatype", () => {
  it("Define Bool datatype", () => {
    const src = `
(data Bool () ()
  (true () (Bool () ()))
  (false () (Bool () ()))
  ind-Bool)
`;
    console.log(evaluatePie(src));
  });

  it("Use Bool constructors", () => {
    const src = `
(data Bool () ()
  (true () (Bool () ()))
  (false () (Bool () ()))
  ind-Bool)

(data-true)
(data-false)
`;
    console.log(evaluatePie(src));
  });

  it("Use Bool eliminator", () => {
    const src = `
(data Bool () ()
  (true () (Bool () ()))
  (false () (Bool () ()))
  ind-Bool)

(data-ind-Bool (data-true)
  (lambda (b) Nat)
  (add1 zero)
  zero)

(data-ind-Bool (data-false)
  (lambda (b) Nat)
  (add1 zero)
  zero)
`;
    console.log(evaluatePie(src));
  });

  it("Use Bool eliminator with wrapper function", () => {
    const src = `
(data Bool () ()
  (true () (Bool () ()))
  (false () (Bool () ()))
  ind-Bool)

(claim bool-to-nat (-> (type-Bool () ()) Nat))
(define bool-to-nat
  (lambda (b)
    (data-ind-Bool b
      (lambda (x) Nat)
      (add1 zero)
      zero)))

(bool-to-nat (data-true))
(bool-to-nat (data-false))
`;
    console.log(evaluatePie(src));
  });
});

describe("LessThan_datatype", () => {
  it("Define Less-Than datatype with indices", () => {
    const src = `
(data Less-Than () ((j Nat) (k Nat))
  (zero-smallest ((n Nat))
    (Less-Than () (zero (add1 n))))
  (add1-smaller ((j Nat) (k Nat) (j<k (type-Less-Than () (j k))))
    (Less-Than () ((add1 j) (add1 k))))
  ind-Less-Than)
`;
    console.log(evaluatePie(src));
  });

  it("Use Less-Than constructors", () => {
    const src = `
(data Less-Than () ((j Nat) (k Nat))
  (zero-smallest ((n Nat))
    (Less-Than () (zero (add1 n))))
  (add1-smaller ((j Nat) (k Nat) (j<k (type-Less-Than () (j k))))
    (Less-Than () ((add1 j) (add1 k))))
  ind-Less-Than)

(data-zero-smallest zero)
(data-zero-smallest (add1 zero))
(data-add1-smaller zero (add1 zero) (data-zero-smallest zero))
`;
    console.log(evaluatePie(src));
  });

  it("Debug add1-smaller constructor", () => {
    const src = `
(data Less-Than () ((j Nat) (k Nat))
  (zero-smallest ((n Nat))
    (Less-Than () (zero (add1 n))))
  (add1-smaller ((j Nat) (k Nat) (j<k (type-Less-Than () (j k))))
    (Less-Than () ((add1 j) (add1 k))))
  ind-Less-Than)

(data-add1-smaller zero (add1 zero) (data-zero-smallest zero))
`;
    console.log(evaluatePie(src));
  });

  it("Use Less-Than with claim/define", () => {
    const src = `
(data Less-Than () ((j Nat) (k Nat))
  (zero-smallest ((n Nat))
    (Less-Than () (zero (add1 n))))
  (add1-smaller ((j Nat) (k Nat) (j<k (type-Less-Than () (j k))))
    (Less-Than () ((add1 j) (add1 k))))
  ind-Less-Than)

(claim proof-0<1 (type-Less-Than () (zero (add1 zero))))
(define proof-0<1 (data-zero-smallest zero))

(claim proof-1<2 (type-Less-Than () ((add1 zero) (add1 (add1 zero)))))
(define proof-1<2
  (data-add1-smaller zero (add1 zero) (data-zero-smallest zero)))
`;
    console.log(evaluatePie(src));
  });

  it("Use Less-Than eliminator with wrapper function", () => {
    const src = `
(data Less-Than () ((j Nat) (k Nat))
  (zero-smallest ((n Nat))
    (Less-Than () (zero (add1 n))))
  (add1-smaller ((j Nat) (k Nat) (j<k (type-Less-Than () (j k))))
    (Less-Than () ((add1 j) (add1 k))))
  ind-Less-Than)

(claim proof-0<1 (type-Less-Than () (zero (add1 zero))))
(define proof-0<1 (data-zero-smallest zero))

(claim extract-smaller
  (Pi ((j Nat) (k Nat))
    (-> (type-Less-Than () (j k)) Nat)))

(define extract-smaller
  (lambda (j k proof)
    (data-ind-Less-Than proof
      (lambda (j-idx k-idx p) Nat)
      (lambda (n) zero)
      (lambda (j-arg k-arg j<k-arg ih) (add1 ih)))))

(claim result-0 Nat)
(define result-0 (extract-smaller zero (add1 zero) proof-0<1))
`;
    console.log(evaluatePie(src));
  });

  it("Use extract-smaller on larger proof (returns non-zero)", () => {
    const src = `
(data Less-Than () ((j Nat) (k Nat))
  (zero-smallest ((n Nat))
    (Less-Than () (zero (add1 n))))
  (add1-smaller ((j Nat) (k Nat) (j<k (type-Less-Than () (j k))))
    (Less-Than () ((add1 j) (add1 k))))
  ind-Less-Than)

(claim extract-smaller
  (Pi ((j Nat) (k Nat))
    (-> (type-Less-Than () (j k)) Nat)))

(define extract-smaller
  (lambda (j k proof)
    (data-ind-Less-Than proof
      (lambda (j-idx k-idx p) Nat)
      (lambda (n) zero)
      (lambda (j-arg k-arg j<k-arg ih) (add1 ih)))))

(claim proof-2<4 (type-Less-Than () ((add1 (add1 zero)) (add1 (add1 (add1 (add1 zero)))))))
(define proof-2<4
  (data-add1-smaller
    (add1 zero)
    (add1 (add1 (add1 zero)))
    (data-add1-smaller
      zero
      (add1 (add1 zero))
      (data-zero-smallest (add1 zero)))))

(claim result-2 Nat)
(define result-2 (extract-smaller (add1 (add1 zero)) (add1 (add1 (add1 (add1 zero)))) proof-2<4))
`;
    console.log(evaluatePie(src));
  });
});

describe("MyList_datatype", () => {
  it("Define MyList datatype with type parameter", () => {
    const src = `
(data MyList ((E U)) ()
  (mynil () (MyList (E) ()))
  (mycons ((head E) (tail (type-MyList (E) ()))) (MyList (E) ()))
  ind-MyList)
`;
    console.log(evaluatePie(src));
  });

  // Note: Parameterized constructors require expected type context (claim/define)
  // Similar to builtin vec::, user-defined MyList constructors cannot infer types standalone

  it("Use MyList with claim/define", () => {
    const src = `
(data MyList ((E U)) ()
  (mynil () (MyList (E) ()))
  (mycons ((head E) (tail (type-MyList (E) ()))) (MyList (E) ()))
  ind-MyList)

(claim empty-list (type-MyList (Nat) ()))
(define empty-list (data-mynil))

(claim one-element-list (type-MyList (Nat) ()))
(define one-element-list (data-mycons zero empty-list))
`;
    console.log(evaluatePie(src));
  });

  it("Use MyList eliminator to compute length", () => {
    const src = `
(data MyList ((E U)) ()
  (mynil () (MyList (E) ()))
  (mycons ((head E) (tail (type-MyList (E) ()))) (MyList (E) ()))
  ind-MyList)

(claim list-length (Pi ((E U)) (-> (type-MyList (E) ()) Nat)))
(define list-length
  (lambda (E lst)
    (data-ind-MyList E lst
      (lambda (l) Nat)
      zero
      (lambda (h t len-t) (add1 len-t)))))

(claim my-list (type-MyList (Nat) ()))
(define my-list (data-mycons (add1 zero) (data-mycons zero (data-mynil))))

(list-length Nat my-list)
`;
    console.log(evaluatePie(src));
  });
});

describe("MyVec_datatype", () => {
  it("Define MyVec datatype with type parameter and index", () => {
    const src = `
(data MyVec ((E U)) ((k Nat))
  (myvecnil () (MyVec (E) (zero)))
  (myveccons ((k Nat) (head E) (tail (type-MyVec (E) (k)))) (MyVec (E) ((add1 k))))
  ind-MyVec)
`;
    console.log(evaluatePie(src));
  });

  // Note: Parameterized constructors require expected type context (claim/define)

  it("Use MyVec with claim/define", () => {
    const src = `
(data MyVec ((E U)) ((k Nat))
  (myvecnil () (MyVec (E) (zero)))
  (myveccons ((k Nat) (head E) (tail (type-MyVec (E) (k)))) (MyVec (E) ((add1 k))))
  ind-MyVec)

(claim empty-vec (type-MyVec (Nat) (zero)))
(define empty-vec (data-myvecnil))

(claim one-element-vec (type-MyVec (Nat) ((add1 zero))))
(define one-element-vec (data-myveccons zero (add1 zero) empty-vec))
`;
    console.log(evaluatePie(src));
  });

  it("Use MyVec eliminator", () => {
    const src = `
(data MyVec ((E U)) ((k Nat))
  (myvecnil () (MyVec (E) (zero)))
  (myveccons ((k Nat) (head E) (tail (type-MyVec (E) (k)))) (MyVec (E) ((add1 k))))
  ind-MyVec)

(claim vec-length (Pi ((E U) (k Nat)) (-> (type-MyVec (E) (k)) Nat)))
(define vec-length
  (lambda (E k v)
    (data-ind-MyVec E k v
      (lambda (k-idx vec) Nat)
      zero
      (lambda (k-arg h t len-t) (add1 len-t)))))

(claim my-vec (type-MyVec (Nat) ((add1 (add1 zero)))))
(define my-vec (data-myveccons (add1 zero) (add1 zero) (data-myveccons zero zero (data-myvecnil))))

(vec-length Nat (add1 (add1 zero)) my-vec)
`;
    console.log(evaluatePie(src));
  });
});
