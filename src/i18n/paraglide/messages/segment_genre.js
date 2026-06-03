/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_GenreInputs */

const uk_segment_genre = /** @type {(inputs: Segment_GenreInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`жанр`)
};

const en_segment_genre = /** @type {(inputs: Segment_GenreInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`genre`)
};

/**
* | output |
* | --- |
* | "genre" |
*
* @param {Segment_GenreInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_genre = /** @type {((inputs?: Segment_GenreInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_GenreInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_genre(inputs)
	return en_segment_genre(inputs)
});