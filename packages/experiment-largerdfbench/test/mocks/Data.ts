import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'n3';
import { RdfStore } from 'rdf-stores';
import type { IHdtDocumentLike } from '../../lib/LineageComputer';
import { termKey } from '../../lib/QueryPatterns';

export const EX = 'http://example.org/';

/**
 * A named node in the example namespace.
 * @param name A local name.
 */
export function ex(name: string): RDF.NamedNode {
  return DataFactory.namedNode(`${EX}${name}`);
}

/**
 * A triple in the default graph.
 * @param subject The subject.
 * @param predicate The predicate.
 * @param object The object.
 */
export function triple(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term): RDF.Quad {
  return DataFactory.quad(<RDF.Quad_Subject> subject, <RDF.Quad_Predicate> predicate, <RDF.Quad_Object> object);
}

/**
 * A fake HDT document over quads, sorted on subject, predicate, and object as in HDT.
 * @param quads Quads.
 */
export function createDocument(quads: RDF.Quad[]): IHdtDocumentLike & { close: jest.Mock } {
  const key = (quad: RDF.Quad): string => [ quad.subject, quad.predicate, quad.object ].map(termKey).join(' ');
  const sorted = [ ...quads ].sort((a, b) => key(a) < key(b) ? -1 : 1);
  const matches = (quad: RDF.Quad, subject?: RDF.Term, predicate?: RDF.Term, object?: RDF.Term): boolean =>
    (!subject || quad.subject.equals(subject)) &&
    (!predicate || quad.predicate.equals(predicate)) &&
    (!object || quad.object.equals(object));
  return {
    async countTriples(subject?: RDF.Term, predicate?: RDF.Term, object?: RDF.Term) {
      return { totalCount: sorted.filter(quad => matches(quad, subject, predicate, object)).length };
    },
    async searchTriples(
      subject?: RDF.Term,
      predicate?: RDF.Term,
      object?: RDF.Term,
      options?: { offset?: number; limit?: number },
    ) {
      const offset = options?.offset ?? 0;
      return {
        triples: sorted.filter(quad => matches(quad, subject, predicate, object))
          .slice(offset, offset + (options?.limit ?? sorted.length)),
      };
    },
    close: jest.fn(),
  };
}

/**
 * A store with the given quads.
 * @param quads Quads.
 */
export function createStore(quads: RDF.Quad[]): RdfStore {
  const store = RdfStore.createDefault();
  for (const quad of quads) {
    store.addQuad(quad);
  }
  return store;
}
