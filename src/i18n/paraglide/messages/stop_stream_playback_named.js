/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Stop_Stream_Playback_NamedInputs */

const uk_stop_stream_playback_named = /** @type {(inputs: Stop_Stream_Playback_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Зупинити відтворення: ${i?.name}`)
};

const en_stop_stream_playback_named = /** @type {(inputs: Stop_Stream_Playback_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Stop playback: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Stop playback: {name}" |
*
* @param {Stop_Stream_Playback_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stop_stream_playback_named = /** @type {((inputs: Stop_Stream_Playback_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stop_Stream_Playback_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stop_stream_playback_named(inputs)
	return en_stop_stream_playback_named(inputs)
});