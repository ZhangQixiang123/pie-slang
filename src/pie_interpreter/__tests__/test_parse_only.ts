import 'jest';
import { schemeParse, pieDeclarationParser } from '../parser/parser';
import { inspect } from 'util';

describe("Parser only tests", () => {
  it("parse myEither datatype declaration", () => {
    const str = `
(data myEither ((A U) (B U)) ()
  (myLeft ((a A)) (myEither (A B) ()))
  (myRight ((b B)) (myEither (A B) ()))
  ind-myEither)

(claim test1 (type-myEither (Nat Atom) ()))
(define test1 (data-myLeft 5))

(claim test2 (type-myEither (Nat Atom) ()))
(define test2 (data-myRight 'hello))

(claim either-to-nat (-> (type-myEither (Nat Nat) ()) Nat))
(define either-to-nat
  (lambda (e)
    (data-ind-myEither e
      (lambda (x) Nat)
      (lambda (n) n)
      (lambda (n) n))))

(either-to-nat (data-myLeft 42))
(either-to-nat (data-myRight 99))
    `;

    const ast = schemeParse(str);
    for (const decl of ast) {
      const parsed = pieDeclarationParser.parseDeclaration(decl);
      console.log(inspect(parsed, true, null, true));
    }
  });
});
