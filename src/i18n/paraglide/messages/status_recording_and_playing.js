/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_Recording_And_PlayingInputs */

const uk_status_recording_and_playing = /** @type {(inputs: Status_Recording_And_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Записується і відтворюється`)
};

const en_status_recording_and_playing = /** @type {(inputs: Status_Recording_And_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording and playing`)
};

/**
* | output |
* | --- |
* | "Recording and playing" |
*
* @param {Status_Recording_And_PlayingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_recording_and_playing = /** @type {((inputs?: Status_Recording_And_PlayingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_Recording_And_PlayingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_recording_and_playing(inputs)
	return en_status_recording_and_playing(inputs)
});