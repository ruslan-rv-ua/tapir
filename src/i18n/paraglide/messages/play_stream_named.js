/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Play_Stream_NamedInputs */

const uk_play_stream_named = /** @type {(inputs: Play_Stream_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Відтворити потік: ${i?.name}`)
};

const en_play_stream_named = /** @type {(inputs: Play_Stream_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Play stream: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Play stream: {name}" |
*
* @param {Play_Stream_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const play_stream_named = /** @type {((inputs: Play_Stream_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Play_Stream_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_play_stream_named(inputs)
	return en_play_stream_named(inputs)
});