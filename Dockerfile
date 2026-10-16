FROM ruby:3.4.1-slim

ENV RAILS_ENV=production BUNDLE_DEPLOYMENT=1 BUNDLE_WITHOUT="development:test" PORT=3117
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libyaml-dev git \
 && rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN bundle install && rm -rf ~/.bundle "$BUNDLE_PATH"/ruby/*/cache

COPY . .
RUN useradd --uid 1000 --no-create-home rails && mkdir -p tmp && chown -R rails tmp
USER rails

EXPOSE 3117
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
